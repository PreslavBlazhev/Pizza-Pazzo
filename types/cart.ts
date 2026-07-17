import type { Product, ProductVariant } from "@/types/product";

/** One line in the cart: a product (with an optional chosen variant) and quantity. */
export interface CartItem {
  /** Unique line id (product id + selected variant id). */
  lineId: string;
  product: Product;
  /** Chosen size/variant, if the product has variants. */
  selectedVariant?: ProductVariant;
  quantity: number;
  /** Unit price in EUR (variant price or product base price). */
  unitPrice: number;
  note?: string;
}

export interface CartTotals {
  itemsCount: number;
  /** EUR amounts. */
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** BGN amounts (лв.), summed from each item's BGN price. */
  subtotalBgn: number;
  deliveryFeeBgn: number;
  totalBgn: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Bridge to the Prisma / SQLite order system
// ═══════════════════════════════════════════════════════════════════════════
//
// The cart is client-side state (Zustand) and has no database table of its own.
// At checkout each `CartItem` is snapshotted into an `OrderItem` (see
// types/order.ts) so an order keeps the product name/price as they were at order
// time, even if the product is later edited. The mapping logic lives in the
// checkout server action (app/actions/checkout.ts).
export type { OrderItem, Order } from "@/types/order";
