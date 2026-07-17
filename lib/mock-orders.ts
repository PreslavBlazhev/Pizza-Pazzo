/**
 * Mock order access. Reads sample orders from /data so the admin panel can be
 * built and demoed before the database exists. Swap for real queries in Stage 5.
 */
import sampleOrders from "@/data/sample-orders.json";
import type { Order } from "@/types/order";

const orders = sampleOrders as unknown as Order[];

export function getMockOrders(): Order[] {
  return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMockOrderById(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}
