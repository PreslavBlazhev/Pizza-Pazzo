import type { CartItem, CartTotals } from "@/types/cart";
import type { Address } from "@/types/user";

export type OrderStatus =
  | "pending" // placed, awaiting restaurant confirmation
  | "accepted" // confirmed with an ETA
  | "preparing"
  | "out_for_delivery"
  | "completed"
  | "cancelled";

export type OrderType = "delivery" | "pickup";

export type PaymentMethod = "cash" | "card_on_delivery";

/** Contact + delivery details captured at checkout. */
export interface OrderCustomer {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

export interface Order {
  id: string;
  /** Human-friendly sequential number shown to staff, e.g. "#1042". */
  number: string;
  status: OrderStatus;
  type: OrderType;
  customer: OrderCustomer;
  address?: Address;
  items: CartItem[];
  totals: CartTotals;
  paymentMethod: PaymentMethod;
  /** Estimated prep/delivery time in minutes, set by the restaurant on accept. */
  etaMinutes?: number;
  customerNote?: string;
  /** Reason shown to the customer when cancelled. */
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Prisma / SQLite order system (DB layer)
// ═══════════════════════════════════════════════════════════════════════════
//
// Everything ABOVE is the legacy mock/UI layer (lowercase unions) still used by
// the admin panel, cart and email templates. Everything BELOW is the real
// database layer for the SQLite + Prisma order system (Parts 2–3) and matches
// `prisma/schema.prisma` exactly.
//
// The two layers coexist deliberately: replacing the lowercase types now would
// break admin/cart code that Part 1 must not touch. `Db`-prefixed names avoid
// the collision with `OrderStatus` / `PaymentMethod` / `Order` above.
//
// SQLite has no native enum type, so these value lists are the canonical source
// of truth the application validates against. Values are UPPERCASE and identical
// to the `@default(...)` strings in the schema.

/** Allowed `Order.status` values (matches schema TEXT column). */
export const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type DbOrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed `Order.paymentMethod` values. Cash on delivery only, for now. */
export const PAYMENT_METHODS = ["CASH_ON_DELIVERY"] as const;
export type DbPaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Allowed `Order.deliveryMethod` values. Delivery only, for now. */
export const DELIVERY_METHODS = ["DELIVERY"] as const;
export type DbDeliveryMethod = (typeof DELIVERY_METHODS)[number];

/**
 * One order line as stored in the database (`OrderItem` model).
 *
 * Money fields are Prisma `Decimal` in the schema; here they are typed as
 * `string` — the safe, precision-preserving serializable shape to pass between
 * server and client. Never parse them into a JS `number` for arithmetic.
 */
export interface DbOrderItem {
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

  unitPriceBgn: string;
  unitPriceEur: string;
  totalPriceBgn: string;
  totalPriceEur: string;

  itemNote: string | null;

  createdAt: string;
}

/**
 * An order as stored in the database (`Order` model). Timestamps are ISO
 * strings and money fields are `Decimal` strings (see {@link DbOrderItem}).
 */
export interface DbOrder {
  id: string;
  orderNumber: number;

  userId: string | null;

  customerName: string;
  customerEmail: string;
  customerPhone: string;

  deliveryAddress: string;
  deliveryCity: string;
  deliveryNote: string | null;

  paymentMethod: DbPaymentMethod;
  deliveryMethod: DbDeliveryMethod;

  status: DbOrderStatus;

  subtotalBgn: string;
  subtotalEur: string;
  deliveryFeeBgn: string;
  deliveryFeeEur: string;
  totalBgn: string;
  totalEur: string;

  estimatedTimeMinutes: number | null;
  adminNote: string | null;

  acceptedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;

  createdAt: string;
  updatedAt: string;

  /** Present when the query includes the relation. */
  items?: DbOrderItem[];
}
