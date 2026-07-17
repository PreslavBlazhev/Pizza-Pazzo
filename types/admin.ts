import type { UserRole } from "./auth";

/**
 * A user as shown in the admin users table (/admin/users).
 * Joins `profiles` with `user_roles` — see `app/actions/admin-users.ts`.
 */
export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  createdAt: string;
}

/** Filter tabs on /admin/users. */
export type AdminUserFilter = "all" | "customers" | "staff" | "admins";

export const ADMIN_USER_FILTER_LABELS: Record<AdminUserFilter, string> = {
  all: "Всички",
  customers: "Клиенти",
  staff: "Staff",
  admins: "Admin",
};

/** Which roles each filter tab shows. */
export const ADMIN_USER_FILTER_ROLES: Record<AdminUserFilter, readonly UserRole[]> = {
  all: ["customer", "staff", "admin", "super_admin"],
  customers: ["customer"],
  staff: ["staff"],
  admins: ["admin", "super_admin"],
};

/** Quick figures for the admin dashboard cards. */
export interface AdminStats {
  ordersToday: number;
  pendingOrders: number;
  revenueToday: number;
  avgPrepMinutes: number;
}
