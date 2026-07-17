/**
 * Customer-facing user types.
 *
 * The authoritative auth types (UserAddress, UserRole, AuthFormData,
 * SessionUser) live in `types/auth.ts` and are re-exported here for convenience.
 */

export type {
  UserAddress,
  UserRole,
  AuthFormData,
  SessionUser,
} from "./auth";

/**
 * Address snapshot stored **on an order**.
 *
 * Deliberately separate from `UserAddress`: an order must keep the address as
 * it was at the time of ordering, even if the customer later edits or deletes
 * the saved address. Used by `types/order.ts`.
 */
export interface Address {
  id: string;
  label?: string;
  street: string;
  number: string;
  entrance?: string;
  floor?: string;
  apartment?: string;
  city: string;
  postalCode?: string;
  note?: string;
}

/**
 * @deprecated Use `Profile` from `types/auth.ts` — profiles now come from
 * Supabase. Kept so the remaining mock-order code keeps compiling; remove it
 * when orders become real.
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  addresses: Address[];
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Prisma / SQLite user system (DB layer)
// ═══════════════════════════════════════════════════════════════════════════
//
// Real database shapes for the SQLite + Prisma system (matches the `User` and
// `UserAddress` models in prisma/schema.prisma). `Db`-prefixed to avoid a
// collision with the legacy `User` above and the `UserRole` re-export.
//
// SQLite has no native enum type, so `USER_ROLES` is the canonical value list.

/** Allowed `User.role` values (matches schema TEXT column). */
export const USER_ROLES = ["CUSTOMER", "STAFF", "ADMIN", "SUPER_ADMIN"] as const;
export type DbUserRole = (typeof USER_ROLES)[number];

/** A saved delivery address (`UserAddress` model). Timestamps are ISO strings. */
export interface DbUserAddress {
  id: string;
  userId: string;

  label: string;
  fullName: string | null;
  phone: string | null;
  city: string;
  addressLine: string;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  deliveryNote: string | null;
  isDefault: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * A registered user (`User` model). `passwordHash` is intentionally omitted —
 * it must never leave the server. Timestamps are ISO strings.
 */
export interface DbUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: DbUserRole;

  createdAt: string;
  updatedAt: string;

  /** Present when the query includes the relation. */
  addresses?: DbUserAddress[];
}
