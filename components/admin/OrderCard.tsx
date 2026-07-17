import { Link } from "@/i18n/navigation";
import type { Order } from "@/types/order";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { OrderStatusBadge } from "./OrderStatusBadge";

export function OrderCard({ order }: { order: Order }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-800">#{order.orderNumber}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-xs text-neutral-500">
          {order.customerName} · {formatDateTime(order.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium text-brand">{formatBgnPrice(order.totalBgn)}</p>
        <p className="text-xs text-neutral-400">{formatEurPrice(order.totalEur)}</p>
        <Link
          href={`/admin/orders/${order.id}`}
          className="text-xs font-medium text-neutral-700 hover:text-brand"
        >
          Отвори →
        </Link>
      </div>
    </Card>
  );
}
