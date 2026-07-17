import type { UserRole } from "./auth";

/**
 * A user as shown in the admin users table (/admin/users).
 * A `User` row from Prisma — see `app/actions/admin-users.ts`.
 */
export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
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
  all: ["CUSTOMER", "STAFF", "ADMIN", "SUPER_ADMIN"],
  customers: ["CUSTOMER"],
  staff: ["STAFF"],
  admins: ["ADMIN", "SUPER_ADMIN"],
};

/** Quick figures for the admin dashboard cards. */
export interface AdminStats {
  ordersToday: number;
  pendingOrders: number;
  revenueToday: number;
  avgPrepMinutes: number;
}
