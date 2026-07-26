import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReportFilters } from "@/components/admin/ReportFilters";
import { ReportOrdersList } from "@/components/admin/ReportOrdersList";
import { ReportSummaryCards } from "@/components/admin/ReportSummaryCards";
import { requireRole } from "@/lib/auth";
import { formatSofiaDate, toSofiaDateString } from "@/lib/report-period";
import { getAdminReport } from "@/lib/reports";
import { resolveReportQuery, type RawSearchParams } from "@/lib/validators/report";
import type { Locale } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "Отчет",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * Admin report (/admin/reports) — ADMIN and SUPER_ADMIN only.
 *
 * A plain server page driven by searchParams: the URL is the whole state, so
 * every view is shareable, the browser's back button works, and no financial
 * figure is ever computed in the browser. `requireRole` re-checks the live role
 * against the database — the middleware rule for this path only validates the
 * (possibly stale) JWT.
 */
export default async function AdminReportsPage({ params, searchParams }: PageProps) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.reports" });
  const raw = await searchParams;

  const now = new Date();
  const resolved = resolveReportQuery(raw, now);
  const report = await getAdminReport({ range: resolved.range, page: resolved.page });

  // Params the paging links must carry forward — whichever selection is active.
  const linkQuery: Record<string, string> = resolved.period
    ? { period: resolved.period }
    : { from: report.range.from, to: report.range.to };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        {t("title")}
      </h1>
      <p className="mt-1.5 text-sm text-pizza-muted">{t("description")}</p>

      <ReportFilters
        activePeriod={resolved.period}
        from={resolved.from}
        to={resolved.to}
        today={toSofiaDateString(now)}
        warning={resolved.warning}
      />

      <p className="mt-5 text-sm font-medium text-pizza-ink">
        {t("rangeLabel", {
          from: formatSofiaDate(resolved.range.from, locale),
          // The stored bound is exclusive; show the last day actually included.
          to: formatSofiaDate(
            new Date(resolved.range.toExclusive.getTime() - 1),
            locale
          ),
        })}
      </p>

      <div className="mt-4">
        <ReportSummaryCards summary={report.summary} />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-pizza-ink">
            {t("orders")}
          </h2>
          <p className="text-sm text-pizza-muted">
            {t("ordersCount", { count: report.pagination.totalItems })}
          </p>
        </div>
        <ReportOrdersList
          orders={report.orders}
          pagination={report.pagination}
          query={linkQuery}
        />
      </section>
    </div>
  );
}
