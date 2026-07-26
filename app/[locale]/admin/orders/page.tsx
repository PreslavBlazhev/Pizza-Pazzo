import type { Metadata } from "next";
import { OrderCard } from "@/components/admin/OrderCard";
import { getOrders } from "@/lib/orders";

export const metadata: Metadata = { title: "Поръчки", robots: { index: false, follow: false } };

/** How many recent orders this screen shows. Older ones stay in the database
 *  and are reached through /admin/reports, which queries by period. */
const ORDERS_LIMIT = 50;

export default async function AdminOrdersPage() {
  const orders = await getOrders(ORDERS_LIMIT);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-neutral-800">Поръчки</h1>
      {orders.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Все още няма поръчки.</p>
      ) : (
        <>
          <p className="mb-6 text-sm text-neutral-500">
            Показват се последните {ORDERS_LIMIT} поръчки. По-старите са
            достъпни в „Отчет“.
          </p>
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
