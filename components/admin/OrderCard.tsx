import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Order } from "@/types/order";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { OrderStatusBadge } from "./OrderStatusBadge";

/**
 * One order row in the admin lists (dashboard, /admin/orders, /admin/reports).
 *
 * The whole card is a single link to the order details. Everything inside is
 * plain text — no nested link or button — which is what makes wrapping the
 * card legal HTML and keeps one tab stop per order.
 */
export function OrderCard({ order }: { order: Order }) {
  const t = useTranslations("admin");

  return (
    <Link
      href={`/admin/orders/${order.id}`}
      aria-label={t("openOrder", { number: order.orderNumber })}
      className="group block rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-pizza-green/50 focus-visible:ring-offset-2"
    >
      <Card className="flex items-center justify-between gap-4 transition group-hover:border-pizza-green/40 group-hover:shadow-card">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-neutral-800">#{order.orderNumber}</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="break-words text-xs text-neutral-500">
            {order.customerName} · {order.customerPhone} ·{" "}
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium text-brand">{formatEurPrice(order.totalEur)}</p>
          <p className="text-xs text-neutral-400">{formatBgnPrice(order.totalBgn)}</p>
          {/* Affordance only — not a separate link, so the card stays one
              target. The arrow moves on hover/focus as a non-colour cue. */}
          <span
            aria-hidden
            className="mt-0.5 inline-block text-xs font-medium text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-brand group-focus-visible:translate-x-0.5"
          >
            →
          </span>
        </div>
      </Card>
    </Link>
  );
}
