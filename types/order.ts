/**
 * Order types for the SQLite/Prisma order system.
 *
 * These are the UI-facing shapes: money is a plain `number`, timestamps are ISO
 * strings and the enum-like fields are narrowed string unions (UPPERCASE, same
 * values as prisma/schema.prisma). `lib/orders.ts` maps raw Prisma rows
 * (Decimal / Date / string) into these before they reach a component.
 */

/** Allowed `Order.status` values (matches the schema TEXT column). */
export const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["CASH_ON_DELIVERY"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DELIVERY_METHODS = ["DELIVERY"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

/** Narrowing guard for a status coming out of the database (typed `string`). */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Snapshot of one extra (crust/addon/sauce) on an order line — see
 * lib/extras-rules.ts for the shape and the per-unit price semantics.
 */
export type { OrderItemExtra } from "@/lib/extras-rules";
import type { OrderItemExtra as ItemExtra } from "@/lib/extras-rules";

/** One line of an order (a snapshot taken at checkout). Money in `number`. */
export interface OrderItem {
  id: string;
  orderId: string;

  productId: string;
  productSlug: string | null;
  productNameBg: string;
  productNameEn: string | null;
  productImageUrl: string | null;

  variantId: string | null;
  variantName: string | null;

  quantity: number;

  /** Base product/variant unit price — extras are NOT folded in here. */
  unitPriceBgn: number;
  unitPriceEur: number;
  /** Full line total INCLUDING extras: (base unit + extras per unit) × quantity. */
  totalPriceBgn: number;
  totalPriceEur: number;

  /** Extras snapshot parsed from extrasJson; [] for legacy/extra-less rows. */
  extras: ItemExtra[];

  itemNote: string | null;
}

/** An order. Timestamps are ISO strings; money is `number` (BGN + EUR). */
export interface Order {
  id: string;
  orderNumber: number;

  userId: string | null;

  customerName: string;
  customerEmail: string;
  customerPhone: string;

  deliveryAddress: string;
  deliveryCity: string;
  deliveryNote: string | null;

  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  status: OrderStatus;

  subtotalBgn: number;
  subtotalEur: number;
  deliveryFeeBgn: number;
  deliveryFeeEur: number;
  totalBgn: number;
  totalEur: number;

  estimatedTimeMinutes: number | null;
  adminNote: string | null;

  acceptedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;

  createdAt: string;
  updatedAt: string;

  /** Present when the query includes the relation. */
  items?: OrderItem[];
}

/** An order guaranteed to carry its line items. */
export type OrderWithItems = Order & { items: OrderItem[] };
