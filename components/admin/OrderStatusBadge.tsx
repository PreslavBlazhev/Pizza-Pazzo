import type { OrderStatus } from "@/types/order";
import { ORDER_STATUS_LABELS_BG, ORDER_STATUS_BADGE_CLASSES } from "@/lib/order-status";
import { cn } from "@/lib/utils";

/** Colour-coded order-status chip (Bulgarian, admin-facing). */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ORDER_STATUS_BADGE_CLASSES[status]
      )}
    >
      {ORDER_STATUS_LABELS_BG[status]}
    </span>
  );
}
