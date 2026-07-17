import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { isUserRole, type Profile, type SessionUser, type UserRole } from "@/types/auth";
import type { ProfileRow, UserAddressRow } from "@/types/database";
import type { UserAddress } from "@/types/auth";

/**
 * Server-side auth helpers.
 *
 * These are the single source of truth for "who is the current user and what
 * may they do". Every server action and protected page goes through here.
 *
 * `cache()` dedupes the Supabase round-trip within one request, so a page can
 * call getSessionUser() in the layout and again in the page for free.
 */

// ── Row → domain mapping (snake_case → camelCase) ─────────────────────────

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    defaultAddressId: row.default_address_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAddress(row: UserAddressRow): UserAddress {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    fullName: row.full_name,
    phone: row.phone,
    city: row.city,
    addressLine: row.address_line,
    entrance: row.entrance,
    floor: row.floor,
    apartment: row.apartment,
    deliveryNote: row.delivery_note,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Session ───────────────────────────────────────────────────────────────

/**
 * The authenticated user, or null.
 *
 * Uses getUser() (not getSession()) — getUser() revalidates the JWT against
 * Supabase, while getSession() trusts a cookie the client could have forged.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
});

/** The current user's profile row, or null when not signed in. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return mapProfile(data as ProfileRow);
});

/**
 * The current user's role. Falls back to "customer" for a signed-in user whose
 * role row is somehow missing — never to something privileged.
 */
export const getCurrentRole = cache(async (): Promise<UserRole | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return "customer";
  return isUserRole(data.role) ? data.role : "customer";
});

/** Profile + role + email in one object, or null when signed out. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const [profile, role] = await Promise.all([getCurrentProfile(), getCurrentRole()]);

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? "",
    profile,
    role: role ?? "customer",
  };
});

/** The current user's saved addresses, newest default first. */
export async function getUserAddresses(): Promise<UserAddress[]> {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as UserAddressRow[]).map(mapAddress);
}

// ── Guards ────────────────────────────────────────────────────────────────

/**
 * Requires a signed-in user; redirects to login otherwise.
 * The middleware already blocks these routes — this is defence in depth for
 * server actions and any page the matcher might miss.
 */
export async function requireUser(redirectTo = "/profile"): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  return sessionUser;
}

/** Requires one of `roles`; redirects to /unauthorized otherwise. */
export async function requireRole(roles: readonly UserRole[]): Promise<SessionUser> {
  const sessionUser = await requireUser();
  if (!roles.includes(sessionUser.role)) {
    redirect("/unauthorized");
  }
  return sessionUser;
}
