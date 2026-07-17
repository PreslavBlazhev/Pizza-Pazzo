/**
 * Order data access — SERVER ONLY.
 *
 * Reads Prisma rows and maps them into the plain, serializable `Order` shape
 * from types/order.ts (money as `number`, timestamps as ISO strings, status
 * narrowed). Components never see a Prisma `Decimal` or `Date`.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
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
    unitPriceBgn: Number(i.unitPriceBgn),
    unitPriceEur: Number(i.unitPriceEur),
    totalPriceBgn: Number(i.totalPriceBgn),
    totalPriceEur: Number(i.totalPriceEur),
    itemNote: i.itemNote,
  };
}

function mapOrder(o: PrismaOrderWithItems): Order {
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
    subtotalBgn: Number(o.subtotalBgn),
    subtotalEur: Number(o.subtotalEur),
    deliveryFeeBgn: Number(o.deliveryFeeBgn),
    deliveryFeeEur: Number(o.deliveryFeeEur),
    totalBgn: Number(o.totalBgn),
    totalEur: Number(o.totalEur),
    estimatedTimeMinutes: o.estimatedTimeMinutes,
    adminNote: o.adminNote,
    acceptedAt: o.acceptedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    items: o.items.map(mapItem),
  };
}

/** All orders, newest first, with their line items. */
export async function getOrders(): Promise<Order[]> {
  const rows = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  return rows.map(mapOrder);
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

/** Writes a validated status change. Assumes the transition was already checked. */
export async function setOrderStatus(id: string, next: OrderStatus): Promise<void> {
  await db.order.update({
    where: { id },
    data: { status: next, ...statusTimestamps(next) },
  });
}
