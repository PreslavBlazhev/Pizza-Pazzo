/**
 * Auth, profile and role types.
 *
 * These mirror the SQL in `docs/supabase-auth-schema.sql`. DB columns are
 * snake_case; everything above the data layer uses camelCase — the mapping
 * lives in `lib/auth.ts`.
 */

/** Roles, ordered from least to most privileged. */
export type UserRole = "customer" | "staff" | "admin" | "super_admin";

// `as const satisfies` keeps the literal tuple type (needed by z.enum) while
// still checking every entry against UserRole.
export const USER_ROLES = [
  "customer",
  "staff",
  "admin",
  "super_admin",
] as const satisfies readonly UserRole[];

/** Roles a super_admin may assign through the UI. super_admin is NOT one of
 *  them — that role is granted only by manual SQL (see the schema file). */
export const ASSIGNABLE_ROLES = [
  "customer",
  "staff",
  "admin",
] as const satisfies readonly UserRole[];

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Клиент",
  staff: "Служител",
  admin: "Администратор",
  super_admin: "Главен администратор",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  customer: "Може да поръчва и да управлява своя профил.",
  staff: "Вижда и обработва поръчки.",
  admin: "Управлява меню, продукти и потребители.",
  super_admin: "Пълен достъп. Може да назначава роли.",
};

/** Can this role open /admin at all? */
export function canAccessAdmin(role: UserRole | null): boolean {
  return role === "staff" || role === "admin" || role === "super_admin";
}

/** Can this role manage users, menu and settings? */
export function isAdminRole(role: UserRole | null): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: UserRole | null): boolean {
  return role === "super_admin";
}

/** Narrowing helper for values coming out of the database. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** A row of `public.profiles`, camelCased. */
export interface Profile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  defaultAddressId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A row of `public.user_addresses`, camelCased. */
export interface UserAddress {
  id: string;
  userId: string;
  label: string | null;
  fullName: string | null;
  phone: string | null;
  city: string | null;
  addressLine: string;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  deliveryNote: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Shape of the registration form. */
export interface AuthFormData {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  phone: string;
  acceptedTerms: boolean;
}

/** The signed-in user as the app sees them: profile + role in one object. */
export interface SessionUser {
  id: string;
  email: string;
  profile: Profile | null;
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
