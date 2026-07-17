/**
 * Customer-facing user types.
 *
 * The authoritative auth types (Profile, UserAddress, UserRole, AuthFormData)
 * live in `types/auth.ts` and are re-exported here for convenience.
 */

export type {
  Profile,
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
