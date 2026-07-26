/**
 * Admin report data access — SERVER ONLY, strictly read-only.
 *
 * Every figure comes from the orders themselves; nothing here reads live menu
 * data and nothing writes. The business definitions are fixed:
 *
 *   delivered  → completedAt != null   (the timestamp, not the current status:
 *                it is the durable fact that the order was completed)
 *   accepted   → acceptedAt  != null   (includes delivered orders — every
 *                delivered order was accepted first)
 *   cancelled  → cancelledAt != null
 *   revenue    → delivered orders only; PENDING / in-progress / CANCELLED
 *                never count, so the figure can never be inflated
 *
 * The period always filters on `createdAt` (the order belongs to the day it was
 * placed) using the half-open range built in lib/report-period.ts.
 *
 * EUR and BGN are summed independently from their stored columns — there is no
 * conversion anywhere.
 *
 * ⚠️ Never import this from a Client Component — it reaches the database
 * through lib/db.ts. (The project marks server modules by convention; the
 * `server-only` package is not a dependency here.)
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { mapOrderRow } from "@/lib/orders";
import type { ReportRange } from "@/lib/report-period";
import { REPORT_PAGE_SIZE } from "@/lib/validators/report";
import type { Order } from "@/types/order";

/** Money rounding. SQLite stores Decimal as REAL, so `_sum` comes back as a
 *  float and can carry drift (95.48999999999999) — always round the total. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prisma Decimal | number | null → a rounded plain number (null → 0). */
function money(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return round2(Number(value));
}

export interface ReportSummary {
  deliveredCount: number;
  acceptedCount: number;
  cancelledCount: number;
  revenueEur: number;
  revenueBgn: number;
  foodRevenueEur: number;
  foodRevenueBgn: number;
  deliveryRevenueEur: number;
  deliveryRevenueBgn: number;
}

export interface ReportPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface AdminReport {
  range: { from: string; to: string };
  summary: ReportSummary;
  /** Orders on the current page, newest first. No line items are loaded. */
  orders: Order[];
  pagination: ReportPagination;
}

export interface GetAdminReportInput {
  range: ReportRange;
  page: number;
  pageSize?: number;
}

/**
 * Runs the whole report: four KPI reads plus the paginated list.
 *
 * Two round trips by design — the counts and the total must be known before
 * the page number can be clamped, so an out-of-range `?page=` shows the last
 * real page instead of an empty screen.
 */
export async function getAdminReport({
  range,
  page,
  pageSize = REPORT_PAGE_SIZE,
}: GetAdminReportInput): Promise<AdminReport> {
  const createdAt = { gte: range.from, lt: range.toExclusive };
  const delivered = { createdAt, completedAt: { not: null } };

  const [deliveredCount, acceptedCount, cancelledCount, revenue, totalItems] =
    await Promise.all([
      db.order.count({ where: delivered }),
      db.order.count({ where: { createdAt, acceptedAt: { not: null } } }),
      db.order.count({ where: { createdAt, cancelledAt: { not: null } } }),
      db.order.aggregate({
        where: delivered,
        _sum: {
          totalEur: true,
          totalBgn: true,
          subtotalEur: true,
          subtotalBgn: true,
          deliveryFeeEur: true,
          deliveryFeeBgn: true,
        },
      }),
      db.order.count({ where: { createdAt } }),
    ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const rows = await db.order.findMany({
    where: { createdAt },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    // No `include: { items: true }` — the list shows totals only, and skipping
    // the join keeps a 50-row page cheap however large the order history gets.
  });

  return {
    range: { from: range.fromDate, to: range.toDate },
    summary: {
      deliveredCount,
      acceptedCount,
      cancelledCount,
      revenueEur: money(revenue._sum.totalEur),
      revenueBgn: money(revenue._sum.totalBgn),
      foodRevenueEur: money(revenue._sum.subtotalEur),
      foodRevenueBgn: money(revenue._sum.subtotalBgn),
      deliveryRevenueEur: money(revenue._sum.deliveryFeeEur),
      deliveryRevenueBgn: money(revenue._sum.deliveryFeeBgn),
    },
    orders: rows.map(mapOrderRow),
    pagination: {
      page: currentPage,
      pageSize,
      totalItems,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
  };
}
