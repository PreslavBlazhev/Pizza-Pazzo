/**
 * Order-status metadata for the SQLite + Prisma order system.
 *
 * Keyed by the UPPERCASE `OrderStatus` values stored in the database
 * (see prisma/schema.prisma and types/order.ts). Pure data + a transition
 * guard — safe to import from both server and client code.
 */
import { isOrderStatus, type DeliveryMethod, type OrderStatus } from "@/types/order";

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
 * Allowed next statuses for a DELIVERY order. An empty array means the order
 * has reached a terminal state. Use {@link canTransition} to enforce this
 * before writing a status change.
 *
 * Every step the customer sees on the tracking page is a step staff take:
 * a delivery goes READY → OUT_FOR_DELIVERY → DELIVERED (no skipping "В
 * доставка", so the page never jumps from "Готова" to "Доставена").
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * The same for an order the customer collects: there is no delivery step —
 * READY ("Готова за получаване") is followed by DELIVERED, shown as
 * "Получена".
 */
export const PICKUP_STATUS_FLOW: Record<OrderStatus, readonly OrderStatus[]> = {
  ...ORDER_STATUS_FLOW,
  READY: ["DELIVERED"],
  OUT_FOR_DELIVERY: [],
};

/** The flow that applies to an order. */
export function statusFlowFor(method: DeliveryMethod | string = "DELIVERY") {
  return method === "PICKUP" ? PICKUP_STATUS_FLOW : ORDER_STATUS_FLOW;
}

/** True if `from → to` is a permitted status transition for that kind of order. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  method: DeliveryMethod | string = "DELIVERY"
): boolean {
  return statusFlowFor(method)[from].includes(to);
}

/**
 * The staff's labels for the step buttons, by delivery method. Not the same
 * as the status names: a button says what the person DOES ("Изпрати с
 * доставчик"), the badge what the order IS ("В доставка").
 */
export function nextStepLabelBg(to: OrderStatus, method: DeliveryMethod | string = "DELIVERY"): string {
  switch (to) {
    case "ACCEPTED":
      return "Приеми";
    case "PREPARING":
      return "Започни приготвяне";
    case "READY":
      return method === "PICKUP" ? "Готова за получаване" : "Готова — чака доставчик";
    case "OUT_FOR_DELIVERY":
      return "Предадена на доставчик";
    case "DELIVERED":
      return method === "PICKUP" ? "Получена от клиента" : "Доставена";
    case "CANCELLED":
      return "Откажи";
    default:
      return ORDER_STATUS_LABELS_BG[to];
  }
}

/** Status name for staff, with the pickup wording where it differs. */
export function statusLabelBg(status: OrderStatus, method: DeliveryMethod | string = "DELIVERY"): string {
  if (method === "PICKUP") {
    if (status === "READY") return "Готова за получаване";
    if (status === "DELIVERED") return "Получена";
  }
  if (status === "READY") return "Готова — чака доставчик";
  return ORDER_STATUS_LABELS_BG[status];
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
