"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import {
  isAdminRole,
  isSuperAdmin,
  isUserRole,
  type ActionResult,
  type UserRole,
} from "@/types/auth";
import type { AdminUser } from "@/types/admin";
import {
  adminRoleUpdateSchema,
  createAdminUserSchema,
  toFieldErrors,
} from "@/lib/validators/auth";

/**
 * Admin user-management server actions (custom SQLite/Prisma auth).
 *
 * Permission model (enforced here — the only gate now that RLS is gone):
 *   CUSTOMER     → no access at all
 *   STAFF        → no access to this module
 *   ADMIN        → may view users; may NOT change roles or create accounts
 *   SUPER_ADMIN  → may view, change roles (CUSTOMER/STAFF/ADMIN) and create
 *                  STAFF/ADMIN accounts
 *
 * SUPER_ADMIN is never assignable through any of these actions — see
 * ASSIGNABLE_ROLES in types/auth.ts. It is granted only by the seed script or a
 * manual DB edit.
 */

/** Shape returned to the users table. */
function toAdminUser(row: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
}): AdminUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    role: isUserRole(row.role) ? row.role : "CUSTOMER",
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Guard: caller must be ADMIN or SUPER_ADMIN. */
async function requireAdminCaller() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { error: "Трябва да сте влезли в профила си." as const, sessionUser: null };
  }
  if (!isAdminRole(sessionUser.role)) {
    return { error: "Нямате достъп до тази операция." as const, sessionUser: null };
  }
  return { error: null, sessionUser };
}

/** Guard: caller must be SUPER_ADMIN. */
async function requireSuperAdminCaller() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { error: "Трябва да сте влезли в профила си." as const, sessionUser: null };
  }
  if (!isSuperAdmin(sessionUser.role)) {
    return {
      error: "Само главен администратор може да извършва тази операция." as const,
      sessionUser: null,
    };
  }
  return { error: null, sessionUser };
}

// ═══════════════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════════════

export interface GetAllUsersResult {
  ok: boolean;
  users: AdminUser[];
  error?: string;
}

/**
 * All users, newest first. Requires ADMIN or SUPER_ADMIN.
 * Never throws — /admin/users renders whatever comes back.
 */
export async function getAllUsers(): Promise<GetAllUsersResult> {
  const { error: guardError } = await requireAdminCaller();
  if (guardError) return { ok: false, users: [], error: guardError };

  try {
    const rows = await db.user.findMany({ orderBy: { createdAt: "desc" } });
    return { ok: true, users: rows.map(toAdminUser) };
  } catch {
    return { ok: false, users: [], error: "Потребителите не можаха да бъдат заредени." };
  }
}

export async function getUserById(
  userId: string
): Promise<{ ok: boolean; user: AdminUser | null; error?: string }> {
  const { error: guardError } = await requireAdminCaller();
  if (guardError) return { ok: false, user: null, error: guardError };

  const row = await db.user.findUnique({ where: { id: userId } });
  if (!row) return { ok: false, user: null, error: "Потребителят не беше намерен." };

  return { ok: true, user: toAdminUser(row) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Role management — SUPER_ADMIN only
// ═══════════════════════════════════════════════════════════════════════════

export async function updateUserRole(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { error: guardError, sessionUser } = await requireSuperAdminCaller();
  if (guardError || !sessionUser) return { ok: false, error: guardError ?? undefined };

  const tv = await getTranslations("validation");

  const parsed = adminRoleUpdateSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const { userId, role } = parsed.data;

  // A super_admin must not be able to demote themselves — that could leave the
  // system with no super_admin at all, recoverable only by manual DB edit.
  if (userId === sessionUser.id) {
    return { ok: false, error: "Не можете да променяте собствената си роля." };
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Потребителят не беше намерен." };

  // Demoting another SUPER_ADMIN stays a manual-DB decision.
  if (target.role === "SUPER_ADMIN") {
    return {
      ok: false,
      error: "Ролята на главен администратор се променя само ръчно през базата.",
    };
  }

  try {
    await db.user.update({ where: { id: userId }, data: { role } });
  } catch {
    return { ok: false, error: "Ролята не можа да бъде променена." };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Ролята е променена." };
}

// ═══════════════════════════════════════════════════════════════════════════
// Account creation — SUPER_ADMIN only
// ═══════════════════════════════════════════════════════════════════════════

export async function createAdminUser(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { error: guardError } = await requireSuperAdminCaller();
  if (guardError) return { ok: false, error: guardError };

  const tv = await getTranslations("validation");

  const parsed = createAdminUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error, tv) };
  }

  const { fullName, email, phone, password, role } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    await db.user.create({
      data: { email, passwordHash, fullName, phone, role },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Вече съществува профил с този имейл." };
    }
    return { ok: false, error: "Профилът не можа да бъде създаден." };
  }

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `Профилът за ${email} е създаден. Дайте паролата на служителя и го помолете да я смени.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Deactivation — SUPER_ADMIN only
// ═══════════════════════════════════════════════════════════════════════════

/** Deactivates a user (blocks sign-in). Orders/profile stay intact. */
export async function deactivateUser(userId: string): Promise<ActionResult> {
  const { error: guardError, sessionUser } = await requireSuperAdminCaller();
  if (guardError || !sessionUser) return { ok: false, error: guardError ?? undefined };

  if (userId === sessionUser.id) {
    return { ok: false, error: "Не можете да деактивирате собствения си профил." };
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Потребителят не беше намерен." };
  if (target.role === "SUPER_ADMIN") {
    return { ok: false, error: "Главен администратор не може да бъде деактивиран оттук." };
  }

  try {
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
  } catch {
    return { ok: false, error: "Профилът не можа да бъде деактивиран." };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Профилът е деактивиран." };
}

/** Undoes `deactivateUser`. */
export async function reactivateUser(userId: string): Promise<ActionResult> {
  const { error: guardError } = await requireSuperAdminCaller();
  if (guardError) return { ok: false, error: guardError };

  try {
    await db.user.update({ where: { id: userId }, data: { isActive: true } });
  } catch {
    return { ok: false, error: "Профилът не можа да бъде активиран." };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Профилът е активиран." };
}

/** Exposed for the UI so it can hide role controls that would just fail. */
export async function getCallerRole(): Promise<UserRole | null> {
  const sessionUser = await getSessionUser();
  return sessionUser?.role ?? null;
}
