import type { OrderStatus } from "@/types/order";
import type { Locale } from "@/i18n/routing";
import {
  ORDER_STATUS_LABELS_BG,
  ORDER_STATUS_LABELS_EN,
  ORDER_STATUS_BADGE_CLASSES,
} from "@/lib/order-status";
import { cn } from "@/lib/utils";

/** Colour-coded order-status chip. Bulgarian by default (admin); pass `locale` on public pages. */
export function OrderStatusBadge({
  status,
  locale = "bg",
}: {
  status: OrderStatus;
  locale?: Locale;
}) {
  const labels = locale === "en" ? ORDER_STATUS_LABELS_EN : ORDER_STATUS_LABELS_BG;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ORDER_STATUS_BADGE_CLASSES[status]
      )}
    >
      {labels[status]}
    </span>
  );
}
