import { cache } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { isUserRole, type SessionUser, type UserRole, type UserAddress } from "@/types/auth";

/**
 * Server-side auth helpers — the single source of truth for "who is the current
 * user and what may they do". Every server action and protected page goes here.
 *
 * The session cookie (a signed JWT) identifies the user; the authoritative
 * role and active-flag are re-read from the database, so a revoked role or a
 * deactivated account takes effect immediately (the JWT itself is not trusted
 * for authorization decisions, only for identity).
 *
 * `cache()` dedupes the DB round-trip within one request.
 */

// ── Session ───────────────────────────────────────────────────────────────

/** The signed-in user (profile + role), or null. Reflects the live DB row. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: isUserRole(user.role) ? user.role : "CUSTOMER",
  };
});

/** The current user's role, or null when signed out. */
export const getCurrentRole = cache(async (): Promise<UserRole | null> => {
  const user = await getSessionUser();
  return user?.role ?? null;
});

/** The current user's saved addresses, default first then newest. */
export async function getUserAddresses(): Promise<UserAddress[]> {
  const user = await getSessionUser();
  if (!user) return [];

  return db.userAddress.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

// ── Guards ────────────────────────────────────────────────────────────────

/**
 * Requires a signed-in user; redirects to login otherwise.
 * The middleware already blocks these routes — this is defence in depth for
 * server actions and any page the matcher might miss.
 *
 * `redirectTo` is an unprefixed path ("/profile"); the locale is re-applied on
 * the way out, so an English visitor is not bounced onto the Bulgarian login.
 */
export async function requireUser(redirectTo = "/profile"): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    const locale = await getLocale();
    redirect({
      href: { pathname: "/auth/login", query: { redirectTo } },
      locale,
    });
  }
  return sessionUser;
}

/** Requires one of `roles`; redirects to /unauthorized otherwise. */
export async function requireRole(roles: readonly UserRole[]): Promise<SessionUser> {
  const sessionUser = await requireUser();
  if (!roles.includes(sessionUser.role)) {
    const locale = await getLocale();
    redirect({ href: "/unauthorized", locale });
  }
  return sessionUser;
}
