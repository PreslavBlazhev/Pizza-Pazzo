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

/**
 * KPI figures for the admin dashboard (/admin), computed in lib/orders.ts.
 * Money is a plain `number` (both currencies stored on the order).
 */
export interface AdminDashboardStats {
  /** Orders created today, any status. */
  ordersToday: number;
  /** Orders awaiting confirmation (PENDING). */
  pendingOrders: number;
  /** Orders in progress (ACCEPTED / PREPARING / READY / OUT_FOR_DELIVERY). */
  activeOrders: number;
  /** Delivered orders, all time. */
  deliveredOrders: number;
  /** Cancelled orders, all time. */
  cancelledOrders: number;
  /** Revenue today, cancelled orders excluded. */
  revenueTodayBgn: number;
  revenueTodayEur: number;
}
