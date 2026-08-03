import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { OrderDetails } from "@/components/admin/OrderDetails";
import { Button } from "@/components/ui/Button";
import { getOrderById } from "@/lib/orders";
import { getPrintTemplates } from "@/lib/print-templates";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [order, printTemplates] = await Promise.all([getOrderById(id), getPrintTemplates()]);
  if (!order) notFound();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/admin/orders" className="text-sm text-neutral-500 hover:text-brand">
          ← Всички поръчки
        </Link>
        <Link href={`/admin/orders/${order.id}/print?t=kitchen`}>
          <Button variant="outline">Печат на бележка</Button>
        </Link>
      </div>
      <OrderDetails order={order} printTemplates={printTemplates} />
    </div>
  );
}
