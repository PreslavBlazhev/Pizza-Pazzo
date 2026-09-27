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
 *                never count, so the figure can never be inflated. It is
 *                split into cash (collected by the driver) and card (paid
 *                online and confirmed by the provider).
 *   paid online → card orders the provider confirmed as PAID, whatever the
 *                kitchen status — the money that actually arrived online
 *   refund due → card orders PAID and then CANCELLED. Refunds are made by
 *                hand in the bank portal; nothing here ever marks one done.
 *
 * Test orders (simulator / bank sandbox) are excluded everywhere, and so are
 * card orders that were never paid — they never reached the kitchen.
 *
 * The period always filters on `createdAt` (the order belongs to the day it was
 * placed) using the half-open range built in lib/report-period.ts.
 *
 * Every figure is summed straight from the stored euro columns — there is no
 * currency conversion anywhere.
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
  /** Delivered revenue collected in cash by the driver. */
  cashRevenueEur: number;
  /** Delivered revenue paid online by card. */
  cardRevenueEur: number;
  /** All provider-confirmed card payments in the period (any kitchen status). */
  paidOnlineEur: number;
  paidOnlineCount: number;
  /** Card payments for orders later cancelled — to refund by hand. */
  refundDueEur: number;
  refundDueCount: number;
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
  // Real orders the kitchen actually got: no simulator/sandbox tests, no
  // card orders that never paid.
  const real = { createdAt, isTest: false, releasedToKitchenAt: { not: null } };
  const delivered = { ...real, completedAt: { not: null } };
  const paidOnline = { createdAt, isTest: false, paymentMethod: "CARD_ONLINE", paymentStatus: "PAID" };

  const [
    deliveredCount,
    acceptedCount,
    cancelledCount,
    revenue,
    cashRevenue,
    cardRevenue,
    paidOnlineSum,
    refundDue,
    totalItems,
  ] = await Promise.all([
    db.order.count({ where: delivered }),
    db.order.count({ where: { ...real, acceptedAt: { not: null } } }),
    db.order.count({ where: { ...real, cancelledAt: { not: null } } }),
    db.order.aggregate({
      where: delivered,
      _sum: {
        totalEur: true,
      },
    }),
    db.order.aggregate({
      where: { ...delivered, paymentMethod: "CASH_ON_DELIVERY" },
      _sum: { totalEur: true },
    }),
    db.order.aggregate({
      where: { ...delivered, paymentMethod: "CARD_ONLINE", paymentStatus: "PAID" },
      _sum: { totalEur: true },
    }),
    db.order.aggregate({ where: paidOnline, _sum: { totalEur: true }, _count: true }),
    db.order.aggregate({
      where: { ...paidOnline, status: "CANCELLED" },
      _sum: { totalEur: true },
      _count: true,
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
      cashRevenueEur: money(cashRevenue._sum.totalEur),
      cardRevenueEur: money(cardRevenue._sum.totalEur),
      paidOnlineEur: money(paidOnlineSum._sum.totalEur),
      paidOnlineCount: paidOnlineSum._count,
      refundDueEur: money(refundDue._sum.totalEur),
      refundDueCount: refundDue._count,
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
