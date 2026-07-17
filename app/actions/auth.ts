"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
 *   - errors are returned as Bulgarian strings, not thrown;
 *   - Supabase's own error messages are mapped, never shown raw (they leak
 *     English internals and sometimes whether an email exists).
 */

/** Translates the Supabase auth errors we actually expect. */
function translateAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "Грешен имейл или парола.";
  }
  if (m.includes("email not confirmed")) {
    return "Имейлът не е потвърден. Проверете пощата си за линк за потвърждение.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "Вече съществува профил с този имейл.";
  }
  if (m.includes("email rate limit") || m.includes("too many requests")) {
    return "Твърде много опити. Опитайте отново след няколко минути.";
  }
  if (m.includes("password should be at least")) {
    return "Паролата е твърде кратка.";
  }
  return "Възникна грешка. Опитайте отново.";
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export async function registerUser(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptedTerms: formData.get("acceptedTerms"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
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
    return { ok: false, error: translateAuthError(error.message) };
  }

  // When email confirmation is ON, Supabase returns a user with no session.
  const needsEmailConfirmation = !data.session;
  if (needsEmailConfirmation) {
    redirect(`/auth/check-email?email=${encodeURIComponent(email)}`);
  }

  revalidatePath("/", "layout");
  redirect("/profile");
}

// ═══════════════════════════════════════════════════════════════════════════
// Login
// ═══════════════════════════════════════════════════════════════════════════

export async function loginUser(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: translateAuthError(error.message) };
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

  if (redirectTo) redirect(redirectTo);

  // Staff land in the admin panel, customers in their profile.
  const role = await getCurrentRole();
  redirect(canAccessAdmin(role) ? "/admin" : "/profile");
}

// ═══════════════════════════════════════════════════════════════════════════
// Logout
// ═══════════════════════════════════════════════════════════════════════════

export async function logoutUser(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}

// ═══════════════════════════════════════════════════════════════════════════
// Profile
// ═══════════════════════════════════════════════════════════════════════════

export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Трябва да сте влезли в профила си." };

  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
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
    return { ok: false, error: "Профилът не можа да бъде обновен." };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Профилът е обновен." };
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
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Трябва да сте влезли в профила си." };

  const parsed = addressSchema.safeParse(readAddressForm(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
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
    return { ok: false, error: "Адресът не можа да бъде запазен." };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Адресът е добавен." };
}

export async function updateAddress(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Трябва да сте влезли в профила си." };

  const parsed = addressUpdateSchema.safeParse({
    ...readAddressForm(formData),
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
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
    return { ok: false, error: "Адресът не можа да бъде обновен." };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Адресът е обновен." };
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Трябва да сте влезли в профила си." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { error } = await supabase
    .from("user_addresses")
    .delete()
    .eq("id", addressId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: "Адресът не можа да бъде изтрит." };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Адресът е изтрит." };
}
