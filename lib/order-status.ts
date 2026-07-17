/**
 * Order-status metadata for the SQLite + Prisma order system.
 *
 * Keyed by the UPPERCASE `DbOrderStatus` values stored in the database
 * (see prisma/schema.prisma and types/order.ts). Pure data + a transition
 * guard — safe to import from both server and client code.
 */
import type { DbOrderStatus } from "@/types/order";

/** Bulgarian labels shown to staff/customers. */
export const ORDER_STATUS_LABELS_BG: Record<DbOrderStatus, string> = {
  PENDING: "Очаква потвърждение",
  ACCEPTED: "Прието",
  PREPARING: "Приготвя се",
  READY: "Готово",
  OUT_FOR_DELIVERY: "В доставка",
  DELIVERED: "Доставено",
  CANCELLED: "Отказано",
};

/** English labels. */
export const ORDER_STATUS_LABELS_EN: Record<DbOrderStatus, string> = {
  PENDING: "Awaiting confirmation",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Tailwind classes for a status badge (background + text + ring). */
export const ORDER_STATUS_BADGE_CLASSES: Record<DbOrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  ACCEPTED: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  PREPARING: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
  READY: "bg-purple-100 text-purple-800 ring-1 ring-purple-200",
  OUT_FOR_DELIVERY: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
  DELIVERED: "bg-green-100 text-green-800 ring-1 ring-green-200",
  CANCELLED: "bg-red-100 text-red-800 ring-1 ring-red-200",
};

/**
 * Allowed next statuses for each status. An empty array means the order has
 * reached a terminal state. Use {@link canTransition} to enforce this before
 * writing a status change.
 */
export const ORDER_STATUS_FLOW: Record<DbOrderStatus, readonly DbOrderStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** True if `from → to` is a permitted status transition. */
export function canTransition(from: DbOrderStatus, to: DbOrderStatus): boolean {
  return ORDER_STATUS_FLOW[from].includes(to);
}
