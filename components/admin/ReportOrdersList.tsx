import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Order } from "@/types/order";
import type { ReportPagination } from "@/lib/reports";
import { OrderCard } from "./OrderCard";
import { cn } from "@/lib/utils";

/**
 * The report's order list: the same <OrderCard /> the orders page and the
 * dashboard use, so there is exactly one order-row design to maintain.
 *
 * Paging is server-rendered links — the page number lives in the URL, never in
 * client state, so back/forward and sharing keep working. Every link carries
 * the active period (or custom range) forward.
 */
export function ReportOrdersList({
  orders,
  pagination,
  query,
}: {
  orders: Order[];
  pagination: ReportPagination;
  /** The period/from/to params to preserve in the paging links. */
  query: Record<string, string>;
}) {
  const t = useTranslations("admin.reports");

  if (orders.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-pizza-cream-dark bg-white px-4 py-10 text-center text-sm text-neutral-500">
        {t("noOrders")}
      </p>
    );
  }

  const pageLink = (page: number) => ({
    pathname: "/admin/reports" as const,
    query: { ...query, page: String(page) },
  });

  const navClass = (enabled: boolean) =>
    cn(
      "rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 focus-visible:ring-offset-2",
      enabled
        ? "border-pizza-cream-dark bg-white text-pizza-ink hover:border-pizza-green/50"
        : "cursor-not-allowed border-pizza-cream-dark/60 bg-pizza-cream text-neutral-400"
    );

  return (
    <>
      <ul className="mt-4 space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} />
          </li>
        ))}
      </ul>

      {pagination.totalPages > 1 && (
        <nav
          className="mt-6 flex flex-wrap items-center justify-between gap-3"
          aria-label={t("orders")}
        >
          {pagination.hasPrevious ? (
            <Link href={pageLink(pagination.page - 1)} className={navClass(true)} rel="prev">
              ← {t("previous")}
            </Link>
          ) : (
            <span className={navClass(false)} aria-disabled="true">
              ← {t("previous")}
            </span>
          )}

          <p aria-live="polite" className="text-sm text-neutral-600">
            {t("pageOf", { page: pagination.page, total: pagination.totalPages })}
          </p>

          {pagination.hasNext ? (
            <Link href={pageLink(pagination.page + 1)} className={navClass(true)} rel="next">
              {t("next")} →
            </Link>
          ) : (
            <span className={navClass(false)} aria-disabled="true">
              {t("next")} →
            </span>
          )}
        </nav>
      )}
    </>
  );
}
