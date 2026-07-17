"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session";
import { canAccessAdmin, isUserRole, type ActionResult } from "@/types/auth";
import {
  addressSchema,
  addressUpdateSchema,
  loginSchema,
  profileUpdateSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/validators/auth";

/**
 * Auth server actions (custom SQLite/Prisma auth).
 *
 * Rules that hold for every action in this file:
 *   - input is validated with zod before touching the database;
 *   - `userId` always comes from the session, NEVER from client input —
 *     otherwise a user could write rows onto someone else's account;
 *   - errors are returned as translated strings, not thrown;
 *   - we never reveal whether an email exists (login failures are generic).
 *
 * `getTranslations()` resolves the locale from the request the action was
 * called on, so a message lands in the language the form was submitted in.
 *
 * Every `redirect` below is the one from `@/i18n/navigation` and is passed an
 * explicit locale, so a visitor who signed in at /en/... is not bounced onto a
 * Bulgarian page.
 */

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

  const { fullName, email, phone, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email, passwordHash, fullName, phone, role: "CUSTOMER" },
    });

    await setSessionCookie({ sub: user.id, email: user.email, role: "CUSTOMER" });
  } catch (error) {
    // Unique constraint on email → the address is already registered.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: te("alreadyRegistered") };
    }
    return { ok: false, error: te("generic") };
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

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({ where: { email } });

  // Same generic error whether the email is unknown or the password is wrong —
  // never leak which accounts exist. bcrypt.compare on a dummy hash would be
  // ideal to equalise timing; acceptable to skip for this workload.
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: te("invalidCredentials") };
  }

  const role = isUserRole(user.role) ? user.role : "CUSTOMER";
  await setSessionCookie({ sub: user.id, email: user.email, role });

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
  redirect({ href: canAccessAdmin(role) ? "/admin" : "/profile", locale });
}

// ═══════════════════════════════════════════════════════════════════════════
// Logout
// ═══════════════════════════════════════════════════════════════════════════

export async function logoutUser(): Promise<void> {
  const locale = await getLocale();
  await clearSessionCookie();

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

  const sessionUser = await getSessionUser();
  if (!sessionUser) return { ok: false, error: t("mustBeSignedIn") };

  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  try {
    await db.user.update({
      where: { id: sessionUser.id },
      data: { fullName: parsed.data.fullName, phone: parsed.data.phone },
    });
  } catch {
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

  const sessionUser = await getSessionUser();
  if (!sessionUser) return { ok: false, error: t("mustBeSignedIn") };

  const parsed = addressSchema.safeParse(readAddressForm(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const a = parsed.data;

  try {
    // The first address a user saves becomes their default automatically.
    const existing = await db.userAddress.count({ where: { userId: sessionUser.id } });
    const isFirst = existing === 0;

    await db.userAddress.create({
      data: {
        userId: sessionUser.id, // from the session — never from the form
        label: a.label ?? undefined, // let the DB default apply when empty
        fullName: a.fullName,
        phone: a.phone,
        city: a.city,
        addressLine: a.addressLine,
        entrance: a.entrance,
        floor: a.floor,
        apartment: a.apartment,
        deliveryNote: a.deliveryNote,
        isDefault: a.isDefault || isFirst,
      },
    });
  } catch {
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

  const sessionUser = await getSessionUser();
  if (!sessionUser) return { ok: false, error: t("mustBeSignedIn") };

  const parsed = addressUpdateSchema.safeParse({
    ...readAddressForm(formData),
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const a = parsed.data;

  try {
    // Scoping the where by userId means a forged id cannot touch someone
    // else's row. updateMany returns a count instead of throwing on no-match.
    const { count } = await db.userAddress.updateMany({
      where: { id: a.id, userId: sessionUser.id },
      data: {
        label: a.label ?? undefined,
        fullName: a.fullName,
        phone: a.phone,
        city: a.city,
        addressLine: a.addressLine,
        entrance: a.entrance,
        floor: a.floor,
        apartment: a.apartment,
        deliveryNote: a.deliveryNote,
        isDefault: a.isDefault,
      },
    });
    if (count === 0) return { ok: false, error: t("address.updateFailed") };
  } catch {
    return { ok: false, error: t("address.updateFailed") };
  }

  revalidatePath("/profile");
  return { ok: true, message: t("address.updated") };
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  const t = await getTranslations("actions");

  const sessionUser = await getSessionUser();
  if (!sessionUser) return { ok: false, error: t("mustBeSignedIn") };

  try {
    const { count } = await db.userAddress.deleteMany({
      where: { id: addressId, userId: sessionUser.id },
    });
    if (count === 0) return { ok: false, error: t("address.deleteFailed") };
  } catch {
    return { ok: false, error: t("address.deleteFailed") };
  }

  revalidatePath("/profile");
  return { ok: true, message: t("address.deleted") };
}
