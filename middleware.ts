import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { canAccessAdmin, isAdminRole, isSuperAdmin } from "@/types/auth";
import type { UserRole } from "@/types/auth";
import { routing, type Locale } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";

/**
 * Locale routing + route protection.
 *
 * Two concerns share one middleware, in this order:
 *
 *   1. next-intl resolves the locale. It must see every page request, because
 *      it is what rewrites `/menu` to `/bg/menu` internally.
 *   2. Auth runs only for protected routes. It verifies the signed session JWT
 *      from the cookie — a pure crypto check, no database, so it is safe on the
 *      Edge and adds nothing to the hot path of the public menu.
 *
 * This is the security boundary for *page access* only. Server actions re-check
 * the session AND the live role/active-flag against the database (see
 * `lib/auth.ts`) — middleware alone is never enough, and the JWT role could be
 * stale, so authorization decisions that matter are re-verified server-side.
 *
 * Access rules (locale prefix is stripped before matching):
 *   /profile/*      → any signed-in user
 *   /checkout       → any signed-in user
 *   /admin          → STAFF, ADMIN, SUPER_ADMIN
 *   /admin/users    → ADMIN, SUPER_ADMIN
 *   /admin/settings → ADMIN, SUPER_ADMIN
 *   /admin/users/roles, /admin/roles → SUPER_ADMIN only
 */

const intlMiddleware = createMiddleware(routing);

/** Routes that only require a session. */
const CUSTOMER_PROTECTED = ["/profile", "/checkout"];

/** Admin sub-paths that need more than the baseline STAFF role. */
const ADMIN_RULES: { prefix: string; allow: readonly UserRole[] }[] = [
  // Most specific first — the first match wins.
  { prefix: "/admin/users/roles", allow: ["SUPER_ADMIN"] },
  { prefix: "/admin/roles", allow: ["SUPER_ADMIN"] },
  { prefix: "/admin/users", allow: ["ADMIN", "SUPER_ADMIN"] },
  { prefix: "/admin/settings", allow: ["ADMIN", "SUPER_ADMIN"] },
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

  // ── 2. Public route → no session check ──
  if (!needsAuth) return intlResponse;

  // ── 3. Protected route → verify the session JWT ──
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    const redirectTo = pathname + request.nextUrl.search;
    return localeRedirect(
      request,
      "/auth/login",
      locale,
      `?redirectTo=${encodeURIComponent(redirectTo)}`
    );
  }

  // Signed in, non-admin route → allowed.
  if (!isAdminPath) return intlResponse;

  const role = session.role;

  // Baseline: /admin at all.
  if (!canAccessAdmin(role)) {
    return localeRedirect(request, "/unauthorized", locale);
  }

  // Stricter rules for specific sub-paths.
  const rule = ADMIN_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );

  if (rule && !rule.allow.includes(role)) {
    return localeRedirect(request, "/unauthorized", locale);
  }

  // Belt and braces: these two helpers are the same checks the pages use, so a
  // future rule added to ADMIN_RULES cannot silently disagree with the UI.
  if (pathname.startsWith("/admin/settings") && !isAdminRole(role)) {
    return localeRedirect(request, "/unauthorized", locale);
  }
  if (pathname.startsWith("/admin/roles") && !isSuperAdmin(role)) {
    return localeRedirect(request, "/unauthorized", locale);
  }

  return intlResponse;
}

export const config = {
  /**
   * Every page, but nothing else.
   *
   * next-intl must see all pages to resolve the locale. The cost is contained
   * by the early return above: public pages run locale routing only, never a
   * session check.
   *
   * Excluded: /api, /_next, /_vercel and anything with a file extension
   * (images, fonts, sitemap.xml, robots.txt).
   */
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
