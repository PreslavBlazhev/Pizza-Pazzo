/**
 * Order-status metadata for the SQLite + Prisma order system.
 *
 * Keyed by the UPPERCASE `OrderStatus` values stored in the database
 * (see prisma/schema.prisma and types/order.ts). Pure data + a transition
 * guard — safe to import from both server and client code.
 */
import { isOrderStatus, type OrderStatus } from "@/types/order";

/** Bulgarian labels shown to staff/customers. */
export const ORDER_STATUS_LABELS_BG: Record<OrderStatus, string> = {
  PENDING: "Очаква потвърждение",
  ACCEPTED: "Прието",
  PREPARING: "Приготвя се",
  READY: "Готово",
  OUT_FOR_DELIVERY: "В доставка",
  DELIVERED: "Доставено",
  CANCELLED: "Отказано",
};

/** English labels. */
export const ORDER_STATUS_LABELS_EN: Record<OrderStatus, string> = {
  PENDING: "Awaiting confirmation",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Tailwind classes for a status badge (background + text + ring). */
export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  ACCEPTED: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  PREPARING: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
  READY: "bg-purple-100 text-purple-800 ring-1 ring-purple-200",
  OUT_FOR_DELIVERY: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
  DELIVERED: "bg-green-100 text-green-800 ring-1 ring-green-200",
  CANCELLED: "bg-red-100 text-red-800 ring-1 ring-red-200",
};

/** Statuses of orders currently in progress (confirmed but not yet closed). */
export const ACTIVE_ORDER_STATUSES = [
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
] as const satisfies readonly OrderStatus[];

/**
 * Allowed next statuses for each status. An empty array means the order has
 * reached a terminal state. Use {@link canTransition} to enforce this before
 * writing a status change.
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** True if `from → to` is a permitted status transition. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_FLOW[from].includes(to);
}

/**
 * True when the order is finished for good — nothing can follow DELIVERED or
 * CANCELLED. Read off the flow table rather than listing the two statuses
 * again, so a new terminal status can never be added in one place and
 * forgotten in the other.
 *
 * Takes a plain string because the callers read it straight out of the
 * database, where the status is TEXT (see prisma/schema.prisma).
 */
export function isTerminalStatus(status: string): boolean {
  return isOrderStatus(status) && ORDER_STATUS_FLOW[status].length === 0;
}
