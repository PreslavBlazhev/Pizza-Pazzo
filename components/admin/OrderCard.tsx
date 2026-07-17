import { Link } from "@/i18n/navigation";
import type { Order } from "@/types/order";
import { formatEur } from "@/lib/format-price";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { OrderStatusBadge } from "./OrderStatusBadge";

export function OrderCard({ order }: { order: Order }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-800">{order.number}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-xs text-neutral-500">
          {order.customer.firstName} {order.customer.lastName} · {formatDateTime(order.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium text-brand">{formatEur(order.totals.total)}</p>
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
