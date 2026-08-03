/**
 * Order data access — SERVER ONLY.
 *
 * Reads Prisma rows and maps them into the plain, serializable `Order` shape
 * from types/order.ts (money as `number`, timestamps as ISO strings, status
 * narrowed). Components never see a Prisma `Decimal` or `Date`.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseOrderItemExtras } from "@/lib/extras-rules";
import { ACTIVE_ORDER_STATUSES } from "@/lib/order-status";
import { startOfSofiaDay } from "@/lib/report-period";
import type { AdminDashboardStats } from "@/types/admin";
import {
  isOrderStatus,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@/types/order";

type PrismaOrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

function mapItem(i: PrismaOrderWithItems["items"][number]): OrderItem {
  return {
    id: i.id,
    orderId: i.orderId,
    productId: i.productId,
    productSlug: i.productSlug,
    productNameBg: i.productNameBg,
    productNameEn: i.productNameEn,
    productImageUrl: i.productImageUrl,
    variantId: i.variantId,
    variantName: i.variantName,
    quantity: i.quantity,
    unitPriceEur: Number(i.unitPriceEur),
    totalPriceEur: Number(i.totalPriceEur),
    // Defensive parse: legacy "[]" rows and any corrupted JSON both map to [].
    extras: parseOrderItemExtras(i.extrasJson),
    itemNote: i.itemNote,
  };
}

/** Order row without its lines — `items` stays undefined (see `Order.items?`). */
type PrismaOrderRow = Prisma.OrderGetPayload<Record<string, never>>;

/**
 * Maps an order row on its own. Used where the line items are not needed (the
 * admin report list), so those queries can skip the `items` join entirely.
 */
export function mapOrderRow(o: PrismaOrderRow): Order {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    userId: o.userId,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    deliveryCity: o.deliveryCity,
    deliveryNote: o.deliveryNote,
    paymentMethod: "CASH_ON_DELIVERY",
    deliveryMethod: "DELIVERY",
    status: isOrderStatus(o.status) ? o.status : "PENDING",
    subtotalEur: Number(o.subtotalEur),
    deliveryFeeEur: Number(o.deliveryFeeEur),
    totalEur: Number(o.totalEur),
    estimatedTimeMinutes: o.estimatedTimeMinutes,
    adminNote: o.adminNote,
    acceptedAt: o.acceptedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function mapOrder(o: PrismaOrderWithItems): Order {
  return { ...mapOrderRow(o), items: o.items.map(mapItem) };
}

/** Hard ceiling for the admin order list — a screen never needs more, and it
 *  keeps the query bounded as the order history grows. Older orders stay in
 *  the database and remain reachable through /admin/reports. */
export const MAX_ADMIN_ORDERS = 200;

/**
 * Orders newest first, with their line items.
 *
 * `limit` is optional for backward compatibility and is clamped to
 * [1, MAX_ADMIN_ORDERS] — callers pass a fixed number, never a user-supplied
 * one. Omitting it keeps the previous "everything" behaviour.
 */
export async function getOrders(limit?: number): Promise<Order[]> {
  const take =
    limit === undefined
      ? undefined
      : Math.min(Math.max(1, Math.trunc(limit)), MAX_ADMIN_ORDERS);

  const rows = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: true },
    ...(take !== undefined && { take }),
  });
  return rows.map(mapOrder);
}

/** Orders still waiting for confirmation, oldest first — the live board's queue. */
export async function getPendingOrders(): Promise<Order[]> {
  const rows = await db.order.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });
  return rows.map(mapOrder);
}

/** Orders of a registered user, newest first. Guest orders have no userId and never match. */
export async function getOrdersForUser(userId: string): Promise<Order[]> {
  const rows = await db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  return rows.map(mapOrder);
}

/** The most recent orders (default 5), with their line items. */
export async function getLatestOrders(limit = 5): Promise<Order[]> {
  const rows = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { items: true },
  });
  return rows.map(mapOrder);
}

/**
 * KPI figures for the admin dashboard. "Today" is the calendar day in
 * **Europe/Sofia** — not the server's local day, which on Render (UTC) started
 * three hours late and put early-morning orders on the wrong date. Today's
 * revenue excludes cancelled orders.
 */
export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const startOfToday = startOfSofiaDay(new Date());

  const [ordersToday, pendingOrders, activeOrders, deliveredOrders, cancelledOrders, revenueToday] =
    await Promise.all([
      db.order.count({ where: { createdAt: { gte: startOfToday } } }),
      db.order.count({ where: { status: "PENDING" } }),
      db.order.count({ where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } }),
      db.order.count({ where: { status: "DELIVERED" } }),
      db.order.count({ where: { status: "CANCELLED" } }),
      db.order.aggregate({
        _sum: { totalEur: true },
        where: { createdAt: { gte: startOfToday }, status: { not: "CANCELLED" } },
      }),
    ]);

  return {
    ordersToday,
    pendingOrders,
    activeOrders,
    deliveredOrders,
    cancelledOrders,
    revenueTodayEur: Number(revenueToday._sum.totalEur ?? 0),
  };
}

/** A single order with its items, or null. */
export async function getOrderById(id: string): Promise<Order | null> {
  const row = await db.order.findUnique({ where: { id }, include: { items: true } });
  return row ? mapOrder(row) : null;
}

/** The current status of an order, narrowed. Null when the order is missing. */
export async function getOrderStatus(id: string): Promise<OrderStatus | null> {
  const row = await db.order.findUnique({ where: { id }, select: { status: true } });
  if (!row) return null;
  return isOrderStatus(row.status) ? row.status : "PENDING";
}

/** Timestamp side-effects for terminal/notable statuses. */
export function statusTimestamps(next: OrderStatus): Prisma.OrderUpdateInput {
  const now = new Date();
  if (next === "ACCEPTED") return { acceptedAt: now };
  if (next === "CANCELLED") return { cancelledAt: now };
  if (next === "DELIVERED") return { completedAt: now };
  return {};
}

/** Optional fields written together with a status change. */
export interface StatusUpdateExtras {
  /** Estimated delivery time, set when accepting an order. */
  estimatedTimeMinutes?: number;
  /** Staff note, e.g. the reason for a cancellation. */
  adminNote?: string;
}

/** Writes a validated status change. Assumes the transition was already checked. */
export async function setOrderStatus(
  id: string,
  next: OrderStatus,
  extras: StatusUpdateExtras = {}
): Promise<void> {
  await db.order.update({
    where: { id },
    data: {
      status: next,
      ...(extras.estimatedTimeMinutes !== undefined && {
        estimatedTimeMinutes: extras.estimatedTimeMinutes,
      }),
      ...(extras.adminNote !== undefined && { adminNote: extras.adminNote }),
      ...statusTimestamps(next),
    },
  });
}
