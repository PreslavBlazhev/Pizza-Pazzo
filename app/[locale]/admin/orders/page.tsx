import type { Metadata } from "next";
import { OrderCard } from "@/components/admin/OrderCard";
import { getMockOrders } from "@/lib/mock-orders";

export const metadata: Metadata = { title: "Order Management" };

export default function AdminOrdersPage() {
  const orders = getMockOrders();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-800">Order Management</h1>
      <div className="space-y-3">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}
