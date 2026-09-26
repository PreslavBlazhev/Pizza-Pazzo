/**
 * Payment status vocabulary — pure data, safe for client and server.
 *
 * Two independent axes describe an order:
 *   Order.status         where the FOOD is   (PENDING → ACCEPTED → … → DELIVERED)
 *   Order.paymentStatus  where the MONEY is  (CASH_DUE | AWAITING_PAYMENT | PAID | …)
 *
 * A card order is created as { status: PENDING, paymentStatus:
 * AWAITING_PAYMENT, releasedToKitchenAt: null } and only a server-to-server
 * confirmation from the provider moves it to PAID and releases it to the
 * kitchen. A cash order is { CASH_DUE, released at checkout } — the flow the
 * restaurant has always had.
 */
import type { PaymentMethod, PaymentStatus } from "@/types/order";

/** Status of ONE attempt at the provider (PaymentAttempt.status). */
export const ATTEMPT_STATUSES = [
  "CREATED", // row written, provider not called yet (or the call failed)
  "REDIRECTED", // provider gave us a hosted page, customer sent there
  "PENDING", // provider says: not finished / not final yet
  "PAID", // provider confirmed the full amount — the only "money arrived"
  "FAILED", // declined / authentication failed
  "CANCELLED", // customer cancelled on the hosted page, or authorization reversed
  "EXPIRED", // the provider's session timed out unused
  "ERROR", // we could not even create the session — no money can have moved
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export function isAttemptStatus(value: unknown): value is AttemptStatus {
  return typeof value === "string" && (ATTEMPT_STATUSES as readonly string[]).includes(value);
}

/**
 * Statuses in which the attempt may still turn into money. A new attempt is
 * never opened while one of these exists — the customer is sent back to the
 * same hosted session instead, so there is only ever one payable session.
 */
export const OPEN_ATTEMPT_STATUSES = ["CREATED", "REDIRECTED", "PENDING"] as const;

export function isOpenAttempt(status: string): boolean {
  return (OPEN_ATTEMPT_STATUSES as readonly string[]).includes(status);
}

/**
 * Final from the customer's point of view: a new attempt may be offered.
 * Deliberately NOT final for the bookkeeping — a verified PAID from the
 * provider still overrides any of these later (late confirmation), because
 * money that did arrive must never be hidden.
 */
export const RETRYABLE_ATTEMPT_STATUSES = ["FAILED", "CANCELLED", "EXPIRED", "ERROR"] as const;

export function isRetryableAttempt(status: string): boolean {
  return (RETRYABLE_ATTEMPT_STATUSES as readonly string[]).includes(status);
}

/** Provider-agnostic outcome an adapter translates its own codes into. */
export type ProviderPaymentState = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";

/**
 * Money problems a human must look at. Stored on Order.paymentAlert and shown
 * in red in the admin — never resolved automatically, never refunded
 * automatically.
 */
export const PAYMENT_ALERTS = {
  /** The provider confirmed a payment after the attempt had looked failed. */
  LATE_CONFIRMATION: "LATE_CONFIRMATION",
  /** A second attempt on an already paid order was ALSO paid. Refund one. */
  DUPLICATE_PAYMENT: "DUPLICATE_PAYMENT",
  /** The provider reported a different amount/currency than we asked for. */
  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",
  /** Payment confirmed for an order the staff had already cancelled. */
  PAID_AFTER_CANCEL: "PAID_AFTER_CANCEL",
} as const;
export type PaymentAlert = (typeof PAYMENT_ALERTS)[keyof typeof PAYMENT_ALERTS];

export const PAYMENT_ALERT_LABELS_BG: Record<PaymentAlert, string> = {
  LATE_CONFIRMATION:
    "Плащането е потвърдено със закъснение. Проверете с клиента дали не е направил втора поръчка.",
  DUPLICATE_PAYMENT:
    "По поръчката има ДВЕ успешни плащания. Едното трябва да се възстанови ръчно през банката.",
  AMOUNT_MISMATCH:
    "Банката потвърди сума или валута, различна от поръчката. Поръчката НЕ е пусната към кухнята — проверете в банковия портал.",
  PAID_AFTER_CANCEL:
    "Плащането е потвърдено след отказа на поръчката. Сумата трябва да се възстанови ръчно през банката.",
};

export function paymentAlertLabel(alert: string | null): string | null {
  if (!alert) return null;
  return (PAYMENT_ALERT_LABELS_BG as Record<string, string>)[alert] ?? alert;
}

export const PAYMENT_METHOD_LABELS: Record<"bg" | "en", Record<PaymentMethod, string>> = {
  bg: { CASH_ON_DELIVERY: "В брой при доставка", CARD_ONLINE: "Онлайн с карта" },
  en: { CASH_ON_DELIVERY: "Cash on delivery", CARD_ONLINE: "Online by card" },
};

export const PAYMENT_STATUS_LABELS: Record<"bg" | "en", Record<PaymentStatus, string>> = {
  bg: {
    CASH_DUE: "За плащане в брой",
    AWAITING_PAYMENT: "Чака плащане",
    PAID: "Платено онлайн",
    FAILED: "Неуспешно плащане",
    CANCELLED: "Отказано плащане",
    EXPIRED: "Изтекло плащане",
  },
  en: {
    CASH_DUE: "Cash due on delivery",
    AWAITING_PAYMENT: "Awaiting payment",
    PAID: "Paid online",
    FAILED: "Payment failed",
    CANCELLED: "Payment cancelled",
    EXPIRED: "Payment expired",
  },
};

export const PAYMENT_STATUS_BADGE_CLASSES: Record<PaymentStatus, string> = {
  CASH_DUE: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  AWAITING_PAYMENT: "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-300",
  PAID: "bg-green-100 text-green-800 ring-1 ring-green-300",
  FAILED: "bg-red-100 text-red-800 ring-1 ring-red-200",
  CANCELLED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  EXPIRED: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-300",
};

export const ATTEMPT_STATUS_LABELS_BG: Record<AttemptStatus, string> = {
  CREATED: "Създаден",
  REDIRECTED: "Пренасочен към банката",
  PENDING: "Чака потвърждение",
  PAID: "Платено",
  FAILED: "Отказано",
  CANCELLED: "Прекъснато",
  EXPIRED: "Изтекло",
  ERROR: "Грешка при създаване",
};

/**
 * Order payment status that follows from the latest attempt's outcome.
 * PAID never goes back — callers never pass it here once the order is paid.
 */
export function orderPaymentStatusFor(attempt: AttemptStatus): PaymentStatus {
  switch (attempt) {
    case "PAID":
      return "PAID";
    case "FAILED":
    case "ERROR":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "AWAITING_PAYMENT";
  }
}

/**
 * The one-line instruction for whoever hands over the food. Printed on the
 * ticket in capitals, because a driver collecting money for an order that was
 * already paid online is the mistake this whole column exists to prevent.
 */
export function collectInstructionBg(
  method: PaymentMethod,
  status: PaymentStatus,
  totalLabel: string
): string {
  if (method === "CARD_ONLINE") {
    return status === "PAID"
      ? "ПЛАТЕНО ОНЛАЙН С КАРТА — НЕ СЪБИРАЙ ПАРИ"
      : "КАРТОВО ПЛАЩАНЕ НЕ Е ПОТВЪРДЕНО — НЕ ИЗПЪЛНЯВАЙ";
  }
  return `В БРОЙ ПРИ ДОСТАВКА — СЪБЕРИ ${totalLabel}`;
}

/**
 * The money gate for staff actions: may the kitchen move this order to
 * `next`? An order the kitchen was never given (an unconfirmed card payment)
 * can only be cancelled — never accepted, prepared or delivered.
 */
export function paymentBlocksStatusChange(
  order: {
    paymentMethod: string;
    paymentStatus: string;
    releasedToKitchenAt: string | Date | null;
  },
  next: string
): boolean {
  if (next === "CANCELLED") return false;
  const unpaidCard = order.paymentMethod === "CARD_ONLINE" && order.paymentStatus !== "PAID";
  return unpaidCard || !order.releasedToKitchenAt;
}
