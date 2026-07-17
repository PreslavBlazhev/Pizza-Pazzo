"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import {
  isAdminRole,
  isSuperAdmin,
  isUserRole,
  type ActionResult,
  type UserRole,
} from "@/types/auth";
import type { AdminUser } from "@/types/admin";
import type { ProfileRow } from "@/types/database";
import { SUPABASE_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/env";
import {
  adminRoleUpdateSchema,
  createAdminUserSchema,
  toFieldErrors,
} from "@/lib/validators/auth";

/**
 * Admin user-management server actions.
 *
 * Permission model (enforced here AND by RLS in the database):
 *   customer     → no access at all
 *   staff        → no access to this module
 *   admin        → may view users; may NOT change roles or create accounts
 *   super_admin  → may view, change roles (customer/staff/admin) and create
 *                  staff/admin accounts
 *
 * 'super_admin' is never assignable through any of these actions — see
 * ASSIGNABLE_ROLES in types/auth.ts and the note in the SQL schema.
 *
 * Reads use the normal (anon-key) server client so RLS applies as a second
 * layer. Only account creation needs the service-role client, because it calls
 * the Supabase auth admin API.
 */

/** Guard: caller must be admin or super_admin. */
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

/** Guard: caller must be super_admin. */
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
  /** True when Supabase env keys are missing — the page shows a dev notice. */
  notConfigured?: boolean;
}

/**
 * All users with their roles. Requires admin or super_admin.
 * Never throws — /admin/users renders whatever comes back.
 */
export async function getAllUsers(): Promise<GetAllUsersResult> {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, users: [], notConfigured: true, error: SUPABASE_NOT_CONFIGURED_MESSAGE };
  }

  const { error: guardError } = await requireAdminCaller();
  if (guardError) return { ok: false, users: [], error: guardError };

  // The RLS policy "Админ чете всички профили" makes this return every row for
  // an admin, and only the caller's own row for anyone else.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, created_at, user_roles(role)")
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, users: [], error: "Потребителите не можаха да бъдат заредени." };
  }

  type Row = Pick<ProfileRow, "id" | "full_name" | "email" | "phone" | "created_at"> & {
    user_roles: { role: string }[] | { role: string } | null;
  };

  const users: AdminUser[] = (data as Row[]).map((row) => {
    // PostgREST returns an array for the embedded table; user_roles is 1:1 so
    // take the first entry.
    const roleValue = Array.isArray(row.user_roles)
      ? row.user_roles[0]?.role
      : row.user_roles?.role;

    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      role: isUserRole(roleValue) ? roleValue : "customer",
      createdAt: row.created_at,
    };
  });

  return { ok: true, users };
}

export async function getUserById(
  userId: string
): Promise<{ ok: boolean; user: AdminUser | null; error?: string }> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, user: null, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { error: guardError } = await requireAdminCaller();
  if (guardError) return { ok: false, user: null, error: guardError };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, created_at, user_roles(role)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, user: null, error: "Потребителят не беше намерен." };
  }

  const row = data as {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    created_at: string;
    user_roles: { role: string }[] | { role: string } | null;
  };

  const roleValue = Array.isArray(row.user_roles)
    ? row.user_roles[0]?.role
    : row.user_roles?.role;

  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      role: isUserRole(roleValue) ? roleValue : "customer",
      createdAt: row.created_at,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Role management — super_admin only
// ═══════════════════════════════════════════════════════════════════════════

export async function updateUserRole(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { error: guardError, sessionUser } = await requireSuperAdminCaller();
  if (guardError || !sessionUser) return { ok: false, error: guardError ?? undefined };

  const parsed = adminRoleUpdateSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const { userId, role } = parsed.data;

  // A super_admin must not be able to demote themselves — that could leave the
  // system with no super_admin at all, recoverable only by manual SQL.
  if (userId === sessionUser.id) {
    return { ok: false, error: "Не можете да променяте собствената си роля." };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  // Guard against demoting another super_admin through this form: the schema
  // cannot produce 'super_admin' as a target, but the *current* role of the
  // target may be super_admin, and that must stay a manual-SQL decision.
  const { data: existing } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.role === "super_admin") {
    return {
      ok: false,
      error: "Ролята на главен администратор се променя само ръчно през базата.",
    };
  }

  // RLS policy "Super admin управлява роли" enforces this a second time.
  const { error } = await supabase
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "Ролята не можа да бъде променена." };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Ролята е променена." };
}

// ═══════════════════════════════════════════════════════════════════════════
// Account creation — super_admin only
// ═══════════════════════════════════════════════════════════════════════════

export async function createAdminUser(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { error: guardError } = await requireSuperAdminCaller();
  if (guardError) return { ok: false, error: guardError };

  const parsed = createAdminUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  if (!isServiceRoleConfigured()) {
    return {
      ok: false,
      error:
        "Липсва SUPABASE_SERVICE_ROLE_KEY. Създаването на служебни профили изисква service role ключ.",
    };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { fullName, email, phone, password, role } = parsed.data;

  // `role` in user_metadata is read by the handle_new_user trigger, which only
  // honours 'staff' and 'admin' — it can never produce a super_admin.
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // staff accounts are created by a human; skip the email
    user_metadata: { full_name: fullName, phone, role },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already been registered") || message.includes("already exists")) {
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
// Deactivation — super_admin only
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deactivates a user by banning them in Supabase Auth for ~100 years.
 * Supabase has no "disabled" flag; a long ban_duration is the documented way.
 * The profile and any future orders stay intact — only sign-in is blocked.
 */
export async function deactivateUser(userId: string): Promise<ActionResult> {
  const { error: guardError, sessionUser } = await requireSuperAdminCaller();
  if (guardError || !sessionUser) return { ok: false, error: guardError ?? undefined };

  if (userId === sessionUser.id) {
    return { ok: false, error: "Не можете да деактивирате собствения си профил." };
  }

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Липсва SUPABASE_SERVICE_ROLE_KEY." };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });

  if (error) {
    return { ok: false, error: "Профилът не можа да бъде деактивиран." };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Профилът е деактивиран." };
}

/** Undoes `deactivateUser`. */
export async function reactivateUser(userId: string): Promise<ActionResult> {
  const { error: guardError } = await requireSuperAdminCaller();
  if (guardError) return { ok: false, error: guardError };

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Липсва SUPABASE_SERVICE_ROLE_KEY." };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: SUPABASE_NOT_CONFIGURED_MESSAGE };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (error) {
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
