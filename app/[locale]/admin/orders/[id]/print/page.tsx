import { notFound } from "next/navigation";
import { PrintTicket } from "@/components/admin/PrintTicket";
import { PrintNowButton } from "@/components/admin/PrintNowButton";
import { getOrderById } from "@/lib/orders";
import { getPrintTemplate } from "@/lib/print-templates";
import { printTemplateIdFromParam, printTemplateLabel } from "@/types/print";
import { Link } from "@/i18n/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; reprint?: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Browser print page for one order. `?t=kitchen|delivery` picks the template;
 * an unknown value falls back to the kitchen slip rather than erroring.
 *
 * The layout — what prints, at what point size, where — comes entirely from
 * /admin/settings/print, so this page has no hardcoded formatting left.
 */
export default async function PrintOrderPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { t, reprint } = await searchParams;

  const templateId = printTemplateIdFromParam(t);
  const [order, template] = await Promise.all([getOrderById(id), getPrintTemplate(templateId)]);
  if (!order) notFound();

  const other = templateId === "KITCHEN" ? "DELIVERY" : "KITCHEN";

  return (
    <div className="p-4">
      <div className="no-print mb-4 space-y-3">
        <p className="text-sm text-pizza-muted">
          Бележка <strong>{printTemplateLabel(templateId)}</strong> за поръчка #
          {order.orderNumber} — {template.paperWidthMm} mm.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PrintNowButton />
          <Link
            href={`/admin/orders/${order.id}/print?t=${other.toLowerCase()}`}
            className="rounded-lg border border-pizza-cream-dark px-4 py-2 text-sm font-medium text-pizza-ink transition hover:bg-pizza-cream"
          >
            Виж бележката за {printTemplateLabel(other).toLowerCase()}
          </Link>
          <Link
            href="/admin/settings/print"
            className="rounded-lg px-4 py-2 text-sm font-medium text-pizza-muted underline underline-offset-4 transition hover:text-pizza-ink"
          >
            Настройки на печата
          </Link>
        </div>
      </div>

      <PrintTicket order={order} template={template} isReprint={reprint === "1"} />
    </div>
  );
}
