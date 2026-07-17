import type { Metadata } from "next";
import { OrderCard } from "@/components/admin/OrderCard";
import { getOrders } from "@/lib/orders";

export const metadata: Metadata = { title: "Поръчки", robots: { index: false, follow: false } };

export default async function AdminOrdersPage() {
  const orders = await getOrders();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-800">Поръчки</h1>
      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">Все още няма поръчки.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
