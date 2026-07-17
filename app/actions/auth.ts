"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getCurrentRole } from "@/lib/auth";
import { canAccessAdmin, type ActionResult } from "@/types/auth";
import { SUPABASE_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/env";
import {
  addressSchema,
  addressUpdateSchema,
  loginSchema,
  profileUpdateSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/validators/auth";

/**
 * Auth server actions.
 *
 * Rules that hold for every action in this file:
 *   - input is validated with zod before touching Supabase;
 *   - `user_id` always comes from the session, NEVER from client input —
 *     otherwise a user could write rows onto someone else's account;
 *   - errors are returned as translated strings, not thrown;
 *   - Supabase's own error messages are mapped, never shown raw (they leak
 *     English internals and sometimes whether an email exists).
 *
 * `getTranslations()` here resolves the locale from the request the action was
 * called on, so a message lands in the language the form was submitted in.
 *
 * Every `redirect` below is the one from `@/i18n/navigation` and is passed an
 * explicit locale. Plain `next/navigation` would send a visitor who signed in
 * at /en/auth/login to the Bulgarian /profile, because an unprefixed path *is*
 * the Bulgarian one.
 */

type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "alreadyRegistered"
  | "rateLimited"
  | "passwordTooShort"
  | "generic";

/** Maps the Supabase auth errors we actually expect onto a message key. */
function authErrorKey(message: string): AuthErrorKey {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) return "invalidCredentials";
  if (m.includes("email not confirmed")) return "emailNotConfirmed";
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "alreadyRegistered";
  }
  if (m.includes("email rate limit") || m.includes("too many requests")) {
    return "rateLimited";
  }
  if (m.includes("password should be at least")) return "passwordTooShort";
  return "generic";
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export async function registerUser(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const locale = await getLocale();
  const tv = await getTranslations("validation");
  const te = await getTranslations("actions.authError");

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptedTerms: formData.get("acceptedTerms"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { fullName, email, phone, password } = parsed.data;

  // full_name/phone go into raw_user_meta_data; the `handle_new_user` trigger
  // reads them to build the profile row. Note we do NOT pass `role` here —
  // the trigger defaults to 'customer' and ignores anything privileged.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });

  if (error) {
    return { ok: false, error: te(authErrorKey(error.message)) };
  }

  // When email confirmation is ON, Supabase returns a user with no session.
  const needsEmailConfirmation = !data.session;
  if (needsEmailConfirmation) {
    redirect({
      href: {
        pathname: "/auth/check-email",
        query: { email },
      },
      locale,
    });
  }

  revalidatePath("/", "layout");
  redirect({ href: "/profile", locale });
}

// ═══════════════════════════════════════════════════════════════════════════
// Login
// ═══════════════════════════════════════════════════════════════════════════

export async function loginUser(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const locale = await getLocale();
  const tv = await getTranslations("validation");
  const te = await getTranslations("actions.authError");

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: te(authErrorKey(error.message)) };
  }

  revalidatePath("/", "layout");

  // Honour ?redirectTo=... from the middleware, but only for relative paths —
  // accepting an absolute URL here would be an open-redirect vulnerability.
  const rawRedirect = formData.get("redirectTo");
  const redirectTo =
    typeof rawRedirect === "string" &&
    rawRedirect.startsWith("/") &&
    !rawRedirect.startsWith("//")
      ? rawRedirect
      : null;

  if (redirectTo) redirect({ href: redirectTo, locale });

  // Staff land in the admin panel, customers in their profile.
  const role = await getCurrentRole();
  redirect({ href: canAccessAdmin(role) ? "/admin" : "/profile", locale });
}

// ═══════════════════════════════════════════════════════════════════════════
// Logout
// ═══════════════════════════════════════════════════════════════════════════

export async function logoutUser(): Promise<void> {
  const locale = await getLocale();
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect({ href: "/", locale });
}

// ═══════════════════════════════════════════════════════════════════════════
// Profile
// ═══════════════════════════════════════════════════════════════════════════

export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const t = await getTranslations("actions");
  const tv = await getTranslations("validation");

  const user = await getAuthUser();
  if (!user) return { ok: false, error: t("mustBeSignedIn") };

  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  // The row is pinned to the session user id, and the RLS policy
  // "Потребителят обновява своя профил" enforces the same server-side.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: t("profile.updateFailed") };
  }

  revalidatePath("/profile");
  return { ok: true, message: t("profile.updated") };
}

// ═══════════════════════════════════════════════════════════════════════════
// Addresses
// ═══════════════════════════════════════════════════════════════════════════

/** Reads the address fields shared by create and update. */
function readAddressForm(formData: FormData) {
  return {
    label: formData.get("label") ?? undefined,
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    addressLine: formData.get("addressLine"),
    entrance: formData.get("entrance") ?? undefined,
    floor: formData.get("floor") ?? undefined,
    apartment: formData.get("apartment") ?? undefined,
    deliveryNote: formData.get("deliveryNote") ?? undefined,
    isDefault: formData.get("isDefault"),
  };
}

export async function createAddress(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const t = await getTranslations("actions");
  const tv = await getTranslations("validation");

  const user = await getAuthUser();
  if (!user) return { ok: false, error: t("mustBeSignedIn") };

  const parsed = addressSchema.safeParse(readAddressForm(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const a = parsed.data;

  // The first address a user saves becomes their default automatically.
  const { count } = await supabase
    .from("user_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const isFirst = (count ?? 0) === 0;

  const { error } = await supabase.from("user_addresses").insert({
    user_id: user.id, // from the session — never from the form
    label: a.label,
    full_name: a.fullName,
    phone: a.phone,
    city: a.city,
    address_line: a.addressLine,
    entrance: a.entrance,
    floor: a.floor,
    apartment: a.apartment,
    delivery_note: a.deliveryNote,
    is_default: a.isDefault || isFirst,
  });

  if (error) {
    return { ok: false, error: t("address.saveFailed") };
  }

  revalidatePath("/profile");
  return { ok: true, message: t("address.added") };
}

export async function updateAddress(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const t = await getTranslations("actions");
  const tv = await getTranslations("validation");

  const user = await getAuthUser();
  if (!user) return { ok: false, error: t("mustBeSignedIn") };

  const parsed = addressUpdateSchema.safeParse({
    ...readAddressForm(formData),
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const a = parsed.data;

  // .eq("user_id", user.id) means a forged id cannot touch someone else's row,
  // even before RLS gets a say.
  const { error } = await supabase
    .from("user_addresses")
    .update({
      label: a.label,
      full_name: a.fullName,
      phone: a.phone,
      city: a.city,
      address_line: a.addressLine,
      entrance: a.entrance,
      floor: a.floor,
      apartment: a.apartment,
      delivery_note: a.deliveryNote,
      is_default: a.isDefault,
    })
    .eq("id", a.id)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: t("address.updateFailed") };
  }

  revalidatePath("/profile");
  return { ok: true, message: t("address.updated") };
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  const t = await getTranslations("actions");

  const user = await getAuthUser();
  if (!user) return { ok: false, error: t("mustBeSignedIn") };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { error } = await supabase
    .from("user_addresses")
    .delete()
    .eq("id", addressId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: t("address.deleteFailed") };
  }

  revalidatePath("/profile");
  return { ok: true, message: t("address.deleted") };
}
