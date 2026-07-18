import type { Order } from "@/types/order";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { formatDateTime } from "@/lib/utils";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderStatusControl } from "./OrderStatusControl";

export function OrderDetails({ order }: { order: Order }) {
  const items = order.items ?? [];

  const priceRow = (label: string, bgn: number, eur: number, strong = false) => (
    <div
      className={`flex items-baseline justify-between ${
        strong
          ? "border-t border-neutral-200 pt-2 font-semibold text-neutral-800"
          : "text-neutral-500"
      }`}
    >
      <span>{label}</span>
      <span>
        {formatEurPrice(eur)}{" "}
        <span className="text-xs text-neutral-400">{formatBgnPrice(bgn)}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-neutral-800">#{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
        <span className="text-sm text-neutral-400">{formatDateTime(order.createdAt)}</span>
      </div>

      {(order.estimatedTimeMinutes !== null || order.adminNote) && (
        <div className="space-y-0.5 text-sm text-neutral-600">
          {order.estimatedTimeMinutes !== null && (
            <p>
              Ориентировъчно време: <strong>{order.estimatedTimeMinutes} мин</strong>
              {order.acceptedAt && (
                <span className="text-neutral-400"> · прието {formatDateTime(order.acceptedAt)}</span>
              )}
            </p>
          )}
          {order.adminNote && <p>Бележка (админ): {order.adminNote}</p>}
        </div>
      )}

      {/* Status control */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-600">Смяна на статус</h2>
        <OrderStatusControl orderId={order.id} status={order.status} />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-600">Клиент</h2>
        <p className="text-sm text-neutral-700">
          {order.customerName} · {order.customerPhone}
        </p>
        <p className="text-sm text-neutral-500">{order.customerEmail}</p>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-600">Доставка</h2>
        <p className="text-sm text-neutral-700">
          {order.deliveryAddress}, {order.deliveryCity}
        </p>
        {order.deliveryNote && (
          <p className="text-sm text-neutral-500">Бележка: {order.deliveryNote}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Продукти</h2>
        <ul className="divide-y divide-neutral-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-2">
              <span className="text-sm text-neutral-700">
                {item.quantity}× {item.productNameBg}
                {item.variantName ? (
                  <span className="text-neutral-400"> ({item.variantName})</span>
                ) : null}
              </span>
              <span className="shrink-0 text-sm font-medium text-neutral-700">
                {formatEurPrice(item.totalPriceEur)}{" "}
                <span className="text-xs text-neutral-400">
                  {formatBgnPrice(item.totalPriceBgn)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-xs space-y-2 text-sm">
        {priceRow("Междинна сума", order.subtotalBgn, order.subtotalEur)}
        {priceRow("Доставка", order.deliveryFeeBgn, order.deliveryFeeEur)}
        {priceRow("Общо", order.totalBgn, order.totalEur, true)}
      </section>

      <p className="text-xs text-neutral-400">Плащане: Наложен платеж</p>
    </div>
  );
}
