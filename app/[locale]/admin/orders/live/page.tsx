import type { Metadata } from "next";
import { LiveOrdersBoard } from "@/components/admin/LiveOrdersBoard";

export const metadata: Metadata = {
  title: "Поръчки на живо",
  robots: { index: false, follow: false },
};

/**
 * The tablet screen for the kitchen: rings until every new order is accepted
 * or cancelled. All the logic is client-side (polling /api/admin/pending-orders);
 * the middleware guards the route for staff+.
 */
export default function LiveOrdersPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-neutral-800">Поръчки на живо</h1>
      <LiveOrdersBoard />
    </div>
  );
}
