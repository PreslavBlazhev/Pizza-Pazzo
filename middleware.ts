import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest, type NextResponse as NextResponseType } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { canAccessAdmin, isAdminRole, isSuperAdmin, isUserRole } from "@/types/auth";
import type { UserRole } from "@/types/auth";
import { routing, type Locale } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";

/**
 * Locale routing + route protection + Supabase session refresh.
 *
 * Two concerns share one middleware, in this order:
 *
 *   1. next-intl resolves the locale. It must see every page request, because
 *      it is what rewrites `/menu` to `/bg/menu` internally.
 *   2. Auth runs only for protected routes. `updateSession` calls
 *      `auth.getUser()`, a network round-trip to Supabase, and putting that in
 *      front of `/` and `/menu` would slow down the hot path of a restaurant
 *      site for no gain. Guests browsing the public menu never touch Supabase.
 *
 * This is the security boundary for *page access* only. Server actions and RLS
 * policies enforce the same rules again at the data layer (defence in depth) —
 * middleware alone is never enough, because it does not guard data access.
 *
 * Access rules (locale prefix is stripped before matching):
 *   /profile/*      → any signed-in user
 *   /checkout       → any signed-in user
 *   /admin          → staff, admin, super_admin
 *   /admin/users    → admin, super_admin
 *   /admin/settings → admin, super_admin
 *   /admin/users/roles, /admin/roles → super_admin only
 */

const intlMiddleware = createMiddleware(routing);

/** Routes that only require a session. */
const CUSTOMER_PROTECTED = ["/profile", "/checkout"];

/** Admin sub-paths that need more than the baseline staff role. */
const ADMIN_RULES: { prefix: string; allow: readonly UserRole[] }[] = [
  // Most specific first — the first match wins.
  { prefix: "/admin/users/roles", allow: ["super_admin"] },
  { prefix: "/admin/roles", allow: ["super_admin"] },
  { prefix: "/admin/users", allow: ["admin", "super_admin"] },
  { prefix: "/admin/settings", allow: ["admin", "super_admin"] },
];

/**
 * Splits `/en/profile` into `{ locale: "en", pathname: "/profile" }`.
 *
 * Every rule below is written in terms of the unprefixed path, so that adding a
 * locale can never silently open a protected route.
 */
function splitLocale(pathname: string): { locale: Locale; pathname: string } {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return { locale, pathname: "/" };
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, pathname: pathname.slice(locale.length + 1) };
    }
  }
  return { locale: routing.defaultLocale, pathname };
}

function isProtectedCustomerPath(pathname: string): boolean {
  return CUSTOMER_PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Carries the refreshed Supabase auth cookies onto whatever response we end up
 * returning. `updateSession` writes the rotated tokens onto its own response;
 * if we return a different one (an intl rewrite, or a redirect to login) those
 * cookies are lost and the user is silently signed out.
 */
function withAuthCookies(
  target: NextResponseType,
  source: NextResponseType
): NextResponseType {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

/** Locale-aware redirect, so an English visitor lands on `/en/auth/login`. */
function localeRedirect(
  request: NextRequest,
  href: string,
  locale: Locale,
  search?: string
) {
  const path = getPathname({ href, locale });
  return NextResponse.redirect(new URL(`${path}${search ?? ""}`, request.url));
}

export async function middleware(request: NextRequest) {
  // ── 1. Locale first ──
  const intlResponse = intlMiddleware(request);

  // A 3xx here is locale negotiation (e.g. an English visitor hitting `/menu`
  // being sent to `/en/menu`). Let it happen; auth is evaluated on the request
  // that follows, against the final URL.
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  const { locale, pathname } = splitLocale(request.nextUrl.pathname);

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const needsAuth = isProtectedCustomerPath(pathname) || isAdminPath;

  // ── 2. Public route → no Supabase round-trip ──
  if (!needsAuth) return intlResponse;

  // ── 3. Protected route → refresh session and check access ──
  const { supabaseResponse, user, supabase } = await updateSession(request);

  if (!user) {
    const redirectTo = pathname + request.nextUrl.search;
    return withAuthCookies(
      localeRedirect(
        request,
        "/auth/login",
        locale,
        `?redirectTo=${encodeURIComponent(redirectTo)}`
      ),
      supabaseResponse
    );
  }

  // Signed in, non-admin route → allowed.
  if (!isAdminPath) return withAuthCookies(intlResponse, supabaseResponse);

  // Without Supabase configured we cannot know the role. Fail closed.
  if (!supabase) {
    return withAuthCookies(
      localeRedirect(request, "/unauthorized", locale),
      supabaseResponse
    );
  }

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role: UserRole = isUserRole(data?.role) ? data.role : "customer";

  // Baseline: /admin at all.
  if (!canAccessAdmin(role)) {
    return withAuthCookies(
      localeRedirect(request, "/unauthorized", locale),
      supabaseResponse
    );
  }

  // Stricter rules for specific sub-paths.
  const rule = ADMIN_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );

  if (rule && !rule.allow.includes(role)) {
    return withAuthCookies(
      localeRedirect(request, "/unauthorized", locale),
      supabaseResponse
    );
  }

  // Belt and braces: these two helpers are the same checks the pages use, so a
  // future rule added to ADMIN_RULES cannot silently disagree with the UI.
  if (pathname.startsWith("/admin/settings") && !isAdminRole(role)) {
    return withAuthCookies(
      localeRedirect(request, "/unauthorized", locale),
      supabaseResponse
    );
  }
  if (pathname.startsWith("/admin/roles") && !isSuperAdmin(role)) {
    return withAuthCookies(
      localeRedirect(request, "/unauthorized", locale),
      supabaseResponse
    );
  }

  return withAuthCookies(intlResponse, supabaseResponse);
}

export const config = {
  /**
   * Every page, but nothing else.
   *
   * Unlike the previous auth-only matcher, next-intl must see all pages to
   * resolve the locale. The cost is contained by the early return above: public
   * pages run locale routing only, never a Supabase call.
   *
   * Excluded: /api, /_next, /_vercel and anything with a file extension
   * (images, fonts, sitemap.xml, robots.txt).
   */
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
