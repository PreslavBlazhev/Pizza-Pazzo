import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
} from "@/lib/payments/status";
import type { Order } from "@/types/order";

/**
 * "В брой" vs "Платено онлайн" at a glance, plus a TEST marker for simulator
 * orders. Staff-facing, Bulgarian like the rest of the admin.
 */
export function PaymentBadge({
  order,
  size = "sm",
}: {
  order: Pick<Order, "paymentMethod" | "paymentStatus" | "isTest">;
  size?: "sm" | "lg";
}) {
  const text = size === "lg" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  const label =
    order.paymentMethod === "CASH_ON_DELIVERY"
      ? PAYMENT_METHOD_LABELS.bg.CASH_ON_DELIVERY
      : PAYMENT_STATUS_LABELS.bg[order.paymentStatus];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`rounded-full font-semibold ${text} ${PAYMENT_STATUS_BADGE_CLASSES[order.paymentStatus]}`}
      >
        {order.paymentMethod === "CARD_ONLINE" ? "💳 " : "💵 "}
        {label}
      </span>
      {order.isTest && (
        <span className={`rounded-full bg-fuchsia-600 font-bold text-white ${text}`}>
          ТЕСТ
        </span>
      )}
    </span>
  );
}
