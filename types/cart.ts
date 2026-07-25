import type { Product, ProductVariant } from "@/types/product";
import type { ExtraSelection } from "@/lib/extras-rules";

/**
 * One chosen extra on a cart line — identifiers and quantity ONLY. Any name or
 * price a UI may cache alongside is display sugar; the server re-derives both
 * from the database at checkout and never trusts the client's copy.
 */
export type CartExtraSelection = ExtraSelection;

/** One line in the cart: a product (with an optional chosen variant) and quantity. */
export interface CartItem {
  /** Unique line id (product id + variant id + extras signature). */
  lineId: string;
  product: Product;
  /** Chosen size/variant, if the product has variants. */
  selectedVariant?: ProductVariant;
  /** Chosen extras (crust/addons/sauces); [] when none — never undefined in
   *  new records (the persist migration normalizes legacy rows). */
  extras: CartExtraSelection[];
  quantity: number;
  /** Unit price in EUR (variant price or product base price, WITHOUT extras). */
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
