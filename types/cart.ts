import type { Product, ProductVariant } from "@/types/product";
import type { ExtraSelection, ExtraType, PizzaToppingGroup } from "@/lib/extras-rules";

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
}

/**
 * One selectable extra option, shaped for the client picker: plain numbers,
 * both languages, nothing Prisma-specific. Flat-priced options (burger addons,
 * sauces) carry priceEur; pizza crust/addons carry sizePrices and the UI shows
 * the price matching the chosen pizza size.
 */
export interface ProductExtraOption {
  key: string;
  sourceProductId: string;
  type: ExtraType;
  nameBg: string;
  nameEn: string;
  priceEur?: number;
  sizePrices?: ProductExtraOptionSizePrice[];
  /** Discreet portion label shown next to the name (e.g. "70 мл.", "50 г"). */
  sizeLabelBg?: string;
  sizeLabelEn?: string;
  /** 1 for crust/addons, EXTRAS_LIMITS.maxSauceQuantity for sauces. */
  maxQuantity: number;
  /** Pizza toppings only: the owner's price group, shown as a heading. */
  group?: PizzaToppingGroup;
}

/** The extras offer for one product page, grouped the way the picker renders. */
export interface ProductExtrasData {
  /** Single-select crust options (pizzas only). */
  crusts: ProductExtraOption[];
  /** Independent checkbox add-ons (the concrete pizza toppings / burger products). */
  addons: ProductExtraOption[];
  /** Sauces with a 0–10 quantity stepper. */
  sauces: ProductExtraOption[];
  /**
   * Toppings included in the price — only on products that come with them
   * ("Моята Пацо": up to 3), null everywhere else. Each option is priced 0.
   */
  freeToppings: { max: number; options: ProductExtraOption[] } | null;
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

/** Cart money totals — EUR amounts. */
export interface CartTotals {
  itemsCount: number;
  /** Lines incl. extras, before any offer. */
  subtotal: number;
  /**
   * regular − package price of the combos (lib/pizza-math.ts); 0 = none.
   * Never negative in the active mode: a pair is a combo only when it saves.
   */
  discount: number;
  /** What the customer pays: subtotal − discount (delivery is free). */
  total: number;
  /**
   * Pizzas in the basket that CAN take part in the offer (standard pizzas in
   * a 30 / 40 size), by quantity. Special pizzas are not counted, so a basket
   * of special pizzas only gets no promise of a package discount.
   */
  comboPizzaCount: number;
  /**
   * Every combo applied, one per pair (empty = none): its package price and
   * the regular price of the two pizzas it replaces (always higher). Shown
   * through lib/offer-display.ts.
   */
  combos: { sizes: "30+30" | "30+40" | "40+40"; comboEur: number; regularEur: number }[];
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
