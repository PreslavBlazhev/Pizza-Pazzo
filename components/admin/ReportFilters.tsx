"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/report-period";
import type { ReportWarning } from "@/lib/validators/report";
import { cn } from "@/lib/utils";

/**
 * Period picker for the admin report.
 *
 * A client component only because it needs the current pathname for the GET
 * form's action — there is no fetching and no state here. Presets are plain
 * links and the custom range is a real `method="get"` form, so both work
 * without JavaScript and produce a shareable, back/forward-friendly URL.
 */
export function ReportFilters({
  activePeriod,
  from,
  to,
  today,
  warning,
}: {
  /** The preset in effect, or null when a custom range is shown. */
  activePeriod: ReportPeriod | null;
  from: string | null;
  to: string | null;
  /** Sofia's calendar date, used as the max for both date inputs. */
  today: string;
  warning: ReportWarning | null;
}) {
  const t = useTranslations("admin.reports");
  // The real browser path (locale prefix included) — the form must post back
  // to the same localized route.
  const action = usePathname();

  return (
    <section className="mt-5 space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-pizza-muted">
          {t("period")}
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {REPORT_PERIODS.map((period) => {
            const active = activePeriod === period;
            return (
              <Link
                key={period}
                href={{ pathname: "/admin/reports", query: { period } }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 focus-visible:ring-offset-2",
                  active
                    ? "border-pizza-green bg-pizza-green text-white"
                    : "border-pizza-cream-dark bg-white text-pizza-ink hover:border-pizza-green/50"
                )}
              >
                {t(period)}
              </Link>
            );
          })}
        </div>
      </div>

      <form
        method="get"
        action={action}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-pizza-cream-dark bg-white p-4"
      >
        <fieldset className="contents">
          <legend className="sr-only">{t("customRange")}</legend>
          <div>
            <label
              htmlFor="report-from"
              className="block text-xs font-medium text-pizza-muted"
            >
              {t("from")}
            </label>
            <input
              id="report-from"
              type="date"
              name="from"
              defaultValue={from ?? ""}
              max={today}
              aria-describedby={warning ? "report-range-warning" : undefined}
              className="mt-1 rounded-xl border border-pizza-cream-dark bg-white px-3 py-2 text-sm text-pizza-ink focus:border-pizza-green focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/40"
            />
          </div>
          <div>
            <label
              htmlFor="report-to"
              className="block text-xs font-medium text-pizza-muted"
            >
              {t("to")}
            </label>
            <input
              id="report-to"
              type="date"
              name="to"
              defaultValue={to ?? ""}
              max={today}
              aria-describedby={warning ? "report-range-warning" : undefined}
              className="mt-1 rounded-xl border border-pizza-cream-dark bg-white px-3 py-2 text-sm text-pizza-ink focus:border-pizza-green focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/40"
            />
          </div>
        </fieldset>
        {/* No `page` field: a new range always starts at page 1. */}
        <button
          type="submit"
          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
        >
          {t("show")}
        </button>
      </form>

      {warning && (
        <p
          id="report-range-warning"
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
        >
          {t(warning)}
        </p>
      )}
    </section>
  );
}
