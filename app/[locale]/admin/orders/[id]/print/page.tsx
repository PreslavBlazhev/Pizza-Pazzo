import { notFound } from "next/navigation";
import { PrintTicket } from "@/components/admin/PrintTicket";
import { getOrderById } from "@/lib/orders";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Thermal Printer Order Ticket.
 * v1 uses the browser print dialog on a page sized for an 80mm thermal printer
 * (see docs/printing-plan.md). Auto-print on load is added in Stage 7.
 */
export default async function PrintOrderPage({ params }: PageProps) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();

  return (
    <div className="p-4">
      <div className="no-print mb-4 text-sm text-neutral-500">
        Thermal Printer Order Ticket — натиснете Ctrl/Cmd + P за печат (80mm).
      </div>
      <PrintTicket order={order} />
    </div>
  );
}
