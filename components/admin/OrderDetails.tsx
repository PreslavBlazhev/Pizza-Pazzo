import type { Order } from "@/types/order";
import { formatEur } from "@/lib/format-price";
import { CartItem } from "@/components/cart/CartItem";
import { CartSummary } from "@/components/cart/CartSummary";
import { OrderStatusBadge } from "./OrderStatusBadge";

export function OrderDetails({ order }: { order: Order }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-neutral-800">{order.number}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-600">Клиент</h2>
        <p className="text-sm text-neutral-700">
          {order.customer.firstName} {order.customer.lastName} · {order.customer.phone}
        </p>
        {order.type === "delivery" && order.address && (
          <p className="text-sm text-neutral-500">
            {order.address.street} {order.address.number}, {order.address.city}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-600">Продукти</h2>
        {order.items.map((item) => (
          <CartItem key={item.lineId} item={item} />
        ))}
      </section>

      <section className="max-w-xs">
        <CartSummary totals={order.totals} />
      </section>

      {order.etaMinutes && (
        <p className="text-sm text-neutral-500">
          Очаквано време: {order.etaMinutes} мин · Плащане: {formatEur(order.totals.total)}
        </p>
      )}
    </div>
  );
}
