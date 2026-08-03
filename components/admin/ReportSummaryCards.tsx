import { useTranslations } from "next-intl";
import type { ReportSummary } from "@/lib/reports";
import { formatEurPrice } from "@/lib/format-price";
import { Card } from "@/components/ui/Card";

/**
 * The report's KPI row. Presentational: every figure is computed server-side
 * in lib/reports.ts (already rounded), so nothing here does arithmetic.
 *
 * Revenue counts delivered orders only and is broken down into food and
 * delivery, both from their own stored euro columns.
 */
export function ReportSummaryCards({ summary }: { summary: ReportSummary }) {
  const t = useTranslations("admin.reports");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {t("deliveredOrders")}
        </p>
        <p className="mt-1 text-2xl font-bold text-neutral-800">
          {summary.deliveredCount}
        </p>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {t("revenue")}
        </p>
        <p className="mt-1 text-2xl font-bold text-brand">
          {formatEurPrice(summary.revenueEur)}
        </p>
        <dl className="mt-3 space-y-1 border-t border-pizza-cream-dark pt-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-neutral-500">{t("foodRevenue")}</dt>
            <dd className="whitespace-nowrap font-medium text-neutral-700">
              {formatEurPrice(summary.foodRevenueEur)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-neutral-500">{t("deliveryRevenue")}</dt>
            <dd className="whitespace-nowrap font-medium text-neutral-700">
              {formatEurPrice(summary.deliveryRevenueEur)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] italic text-neutral-400">
          {t("revenueHint")}
        </p>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {t("acceptedOrders")}
        </p>
        <p className="mt-1 text-2xl font-bold text-neutral-800">
          {summary.acceptedCount}
        </p>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {t("cancelledOrders")}
        </p>
        <p className="mt-1 text-2xl font-bold text-neutral-800">
          {summary.cancelledCount}
        </p>
      </Card>
    </div>
  );
}
