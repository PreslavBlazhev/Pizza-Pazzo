import type { Product, ProductVariant } from "@/types/product";
import type { ExtraSelection, ExtraType } from "@/lib/extras-rules";

/**
 * Display-only preview of a chosen extra, captured from the menu data at the
 * moment it was added. Used by the cart/checkout UI so it can show names and
 * preview prices without a DB round-trip. The server NEVER sees these values —
 * the checkout serializer strips everything except key/sourceProductId/quantity
 * and re-derives names and prices from the database.
 */
export interface CartExtraDisplay {
  nameBg: string;
  nameEn: string;
  unitPriceEur: number;
  unitPriceBgn: number;
  /** Size the preview price was matched against (e.g. "30 см"). */
  sizeContext?: string;
}

/**
 * One chosen extra on a cart line — identifiers and quantity are the payload;
 * `display` is UI preview sugar the server ignores.
 */
export interface CartExtraSelection extends ExtraSelection {
  display?: CartExtraDisplay;
}

// ── Product-page extras picker data (built server-side in lib/menu-data.ts) ──

/** One priced size of a variant-based pizza addon (30/40 см). */
export interface ProductExtraOptionSizePrice {
  variantId: string;
  /** Numeric size parsed from the variant name (30, 40, …). */
  size: number;
  priceEur: number;
  priceBgn: number;
}

/**
 * One selectable extra option, shaped for the client picker: plain numbers,
 * both languages, nothing Prisma-specific. Flat-priced options (burger addons,
 * sauces) carry priceEur/priceBgn; pizza crust/addons carry sizePrices and the
 * UI shows the price matching the chosen pizza size.
 */
export interface ProductExtraOption {
  key: string;
  sourceProductId: string;
  type: ExtraType;
  nameBg: string;
  nameEn: string;
  priceEur?: number;
  priceBgn?: number;
  sizePrices?: ProductExtraOptionSizePrice[];
  /** Discreet portion label shown next to the name (e.g. "70 мл.", "50 г"). */
  sizeLabelBg?: string;
  sizeLabelEn?: string;
  /** 1 for crust/addons, EXTRAS_LIMITS.maxSauceQuantity for sauces. */
  maxQuantity: number;
}

/** The extras offer for one product page, grouped the way the picker renders. */
export interface ProductExtrasData {
  /** Single-select crust options (pizzas only). */
  crusts: ProductExtraOption[];
  /** Independent checkbox add-ons (pizza generic groups / burger products). */
  addons: ProductExtraOption[];
  /** Sauces with a 0–10 quantity stepper. */
  sauces: ProductExtraOption[];
}

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
