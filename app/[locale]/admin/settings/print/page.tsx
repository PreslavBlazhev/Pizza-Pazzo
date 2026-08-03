import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { PrintTemplateForm } from "@/components/admin/PrintTemplateForm";
import { getPrintTemplate } from "@/lib/print-templates";
import { requireRole } from "@/lib/auth";
import {
  PRINT_TEMPLATE_IDS,
  printTemplateIdFromParam,
  printTemplateLabel,
} from "@/types/print";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Настройки на печата" };

/**
 * Print template editor — ADMIN+ (middleware guards /admin/settings, and
 * requireRole re-checks against the database).
 *
 * One tab per ticket: the kitchen slip and the delivery slip are separate
 * layouts, because the cooks and the driver need different things on paper.
 *
 * The admin panel stays Bulgarian-only on purpose (docs/project-scope.md).
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ t?: string }>;
}

export default async function AdminPrintSettingsPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const { t } = await searchParams;
  const templateId = printTemplateIdFromParam(t);
  const template = await getPrintTemplate(templateId);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Настройки на печата
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-pizza-muted">
        Управлявате какво излиза на бележките, с какъв размер и на коя позиция.
        Промените важат веднага — и за печат през браузъра, и за термо принтера
        на таблета.
      </p>

      <nav className="mt-5 flex gap-2" aria-label="Вид бележка">
        {PRINT_TEMPLATE_IDS.map((id) => (
          <Link
            key={id}
            href={`/admin/settings/print?t=${id.toLowerCase()}`}
            aria-current={id === templateId ? "page" : undefined}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              id === templateId
                ? "bg-pizza-ink text-white shadow-sm"
                : "border border-pizza-cream-dark bg-white text-pizza-ink hover:bg-pizza-cream"
            )}
          >
            Бележка: {printTemplateLabel(id)}
          </Link>
        ))}
      </nav>

      {/* Remounts on tab change so the draft state re-seeds from the server. */}
      <PrintTemplateForm key={templateId} template={template} />
    </div>
  );
}
