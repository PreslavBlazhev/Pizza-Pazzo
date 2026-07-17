import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { canAccessAdmin, isAdminRole, isSuperAdmin, isUserRole } from "@/types/auth";
import type { UserRole } from "@/types/auth";

/**
 * Route protection + Supabase session refresh.
 *
 * This is the real security boundary for page access: it runs before any page
 * renders, so a protected route never even starts. Server actions and RLS
 * policies enforce the same rules again at the data layer (defence in depth) —
 * middleware alone is never enough, because it does not guard data access.
 *
 * Access rules:
 *   /profile/*      → any signed-in user
 *   /checkout       → any signed-in user
 *   /admin          → staff, admin, super_admin
 *   /admin/users    → admin, super_admin
 *   /admin/settings → admin, super_admin
 *   /admin/users/roles, /admin/roles → super_admin only
 */

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

function isProtectedCustomerPath(pathname: string): boolean {
  return CUSTOMER_PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function middleware(request: NextRequest) {
  // Always refresh first: this rotates the auth cookies onto the response.
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const needsAuth = isProtectedCustomerPath(pathname) || isAdminPath;

  if (!needsAuth) return supabaseResponse;

  // ── Not signed in → send to login, remembering where they were going ──
  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // ── Signed in, non-admin route → allowed ──
  if (!isAdminPath) return supabaseResponse;

  // ── Admin routes: role check ──
  // Without Supabase configured we cannot know the role. Fail closed.
  if (!supabase) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role: UserRole = isUserRole(data?.role) ? data.role : "customer";

  // Baseline: /admin at all.
  if (!canAccessAdmin(role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // Stricter rules for specific sub-paths.
  const rule = ADMIN_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );

  if (rule && !rule.allow.includes(role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // Belt and braces: these two helpers are the same checks the pages use, so a
  // future rule added to ADMIN_RULES cannot silently disagree with the UI.
  if (pathname.startsWith("/admin/settings") && !isAdminRole(role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }
  if (pathname.startsWith("/admin/roles") && !isSuperAdmin(role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return supabaseResponse;
}

export const config = {
  /**
   * Only the protected routes.
   *
   * The usual Supabase example matches every path, but `updateSession` calls
   * `auth.getUser()`, which is a network round-trip to Supabase. Running that
   * on `/` and `/menu` would put a remote call in front of pages that are
   * otherwise static — for a restaurant menu that is the hot path.
   *
   * The trade-off: session cookies are not refreshed while a guest browses the
   * public site. That is fine, because the browser client in
   * `components/layout/HeaderAuth.tsx` refreshes tokens client-side, and any
   * route that actually depends on the session is listed here.
   */
  matcher: ["/profile/:path*", "/checkout", "/admin/:path*"],
};
