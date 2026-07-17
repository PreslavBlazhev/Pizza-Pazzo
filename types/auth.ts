/**
 * Auth and role types for the custom SQLite/Prisma auth system.
 *
 * Roles are UPPERCASE and match the `User.role` TEXT column in
 * prisma/schema.prisma. User/address shapes come straight from Prisma.
 */
import type { UserAddress as PrismaUserAddress } from "@prisma/client";

/** Roles, ordered from least to most privileged. Match the DB values. */
export type UserRole = "CUSTOMER" | "STAFF" | "ADMIN" | "SUPER_ADMIN";

// `as const satisfies` keeps the literal tuple type (needed by z.enum) while
// still checking every entry against UserRole.
export const USER_ROLES = [
  "CUSTOMER",
  "STAFF",
  "ADMIN",
  "SUPER_ADMIN",
] as const satisfies readonly UserRole[];

/** Roles a super_admin may assign through the UI. SUPER_ADMIN is NOT one of
 *  them — that role is granted only by the seed script / manual DB edit. */
export const ASSIGNABLE_ROLES = [
  "CUSTOMER",
  "STAFF",
  "ADMIN",
] as const satisfies readonly UserRole[];

export const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: "Клиент",
  STAFF: "Служител",
  ADMIN: "Администратор",
  SUPER_ADMIN: "Главен администратор",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  CUSTOMER: "Може да поръчва и да управлява своя профил.",
  STAFF: "Вижда и обработва поръчки.",
  ADMIN: "Управлява меню, продукти и потребители.",
  SUPER_ADMIN: "Пълен достъп. Може да назначава роли.",
};

/** Can this role open /admin at all? */
export function canAccessAdmin(role: UserRole | null): boolean {
  return role === "STAFF" || role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Can this role manage users, menu and settings? */
export function isAdminRole(role: UserRole | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function isSuperAdmin(role: UserRole | null): boolean {
  return role === "SUPER_ADMIN";
}

/** Narrowing helper for values coming out of the database / a JWT. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** A saved delivery address — the Prisma row shape. */
export type UserAddress = PrismaUserAddress;

/** Shape of the registration form. */
export interface AuthFormData {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  phone: string;
  acceptedTerms: boolean;
}

/**
 * The signed-in user as the app sees them. Never carries `passwordHash`.
 * `fullName`/`phone` come from the `User` row (the old `profiles` table is
 * folded into `User`).
 */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
}

/**
 * Uniform return type for every auth/admin server action.
 * `fieldErrors` maps a form field name to its first Bulgarian error message.
 */
export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}
