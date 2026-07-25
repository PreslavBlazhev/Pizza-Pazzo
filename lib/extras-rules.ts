/**
 * Extras (добавки/сосове) — central rules, types and pure helpers.
 *
 * Single source of truth for WHICH extras are allowed on WHAT and for the
 * stable selection keys. Prices are deliberately NOT here: the only pricing
 * source is the MenuProduct/MenuVariant rows in the database (resolved
 * server-side in lib/extras-resolve.ts).
 *
 * IMPORTANT: this module (and lib/extras-resolve.ts) must stay dependency-free
 * and use only relative imports — scripts/smoke-checkout.mjs compiles the two
 * files standalone with `tsc` and unit-tests them outside of Next.js.
 */

// ── Category ids (stable, preserved from the JSON seed — see schema notes) ──

export const PIZZA_CATEGORY_IDS = ["cat_pizzas_standard", "cat_pizzas_special"] as const;
export const BURGER_CATEGORY_ID = "cat_burgers";
export const PIZZA_ADDONS_CATEGORY_ID = "cat_pizza_addons";
export const BURGER_ADDONS_CATEGORY_ID = "cat_burger_addons";
export const SAUCES_CATEGORY_ID = "cat_sauces";

/**
 * Categories that must never get sauces attached (explicit deny list — the
 * remaining food categories: pizzas, burgers, starters, salads etc. allow
 * them). Uses stable ids, never translated names.
 */
export const SAUCE_DENY_CATEGORY_IDS = ["cat_drinks", "cat_desserts"] as const;

// ── Limits ──────────────────────────────────────────────────────────────────

export const EXTRAS_LIMITS = {
  /** Max entries in one cart/order item's extras array. */
  maxExtrasPerItem: 15,
  /** Max quantity for a single sauce (crust/addons are always quantity 1). */
  maxSauceQuantity: 10,
  /** Max items in one checkout payload. */
  maxOrderItems: 50,
} as const;

// ── Types ───────────────────────────────────────────────────────────────────

export type ExtraType = "pizza_crust" | "pizza_addon" | "burger_addon" | "sauce";

const EXTRA_TYPES: readonly ExtraType[] = ["pizza_crust", "pizza_addon", "burger_addon", "sauce"];

/**
 * What the CLIENT sends for one chosen extra. No names, no prices — the
 * server re-derives everything from the key + the database.
 */
export interface ExtraSelection {
  key: string;
  sourceProductId: string;
  quantity: number;
}

/**
 * Immutable snapshot of one resolved extra, stored in OrderItem.extrasJson.
 *
 * Semantics: `quantity` and `totalPrice*` are PER ONE UNIT of the main order
 * item — the full line total is (base unit price + Σ extra.totalPrice) ×
 * OrderItem.quantity. "2 пици, всяка с 2 соса" therefore stores the sauce with
 * quantity 2 and the OrderItem with quantity 2.
 */
export interface OrderItemExtra {
  key: string;
  sourceProductId: string;
  /** Set for variant-based pizza addons (the 30/40 см addon variant used). */
  sourceVariantId?: string;
  type: ExtraType;
  nameBg: string;
  nameEn: string;
  quantity: number;
  /** Size context the price was matched against, e.g. "30 см". */
  sizeContext?: string;
  unitPriceEur: number;
  unitPriceBgn: number;
  totalPriceEur: number;
  totalPriceBgn: number;
}

// ── Pizza selection definitions ─────────────────────────────────────────────

/**
 * Pricing source products (stable prod_* ids from the seed/DB). The four crust
 * flavours share one priced product; meat/dairy/fish share another. The
 * customer-facing labels below intentionally differ from the combined DB
 * names — the snapshot stores THESE labels, the DB rows only supply prices.
 */
export const PIZZA_CRUST_SOURCE_PRODUCT_ID =
  "prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord";
export const PIZZA_GENERIC_ADDON_SOURCE_PRODUCT_ID = "prod_mesni_mlechni_ribni";
export const PIZZA_VEGETABLE_ADDON_SOURCE_PRODUCT_ID = "prod_zelenchukovi";

export interface PizzaSelectionDefinition {
  type: "pizza_crust" | "pizza_addon";
  sourceProductId: string;
  nameBg: string;
  nameEn: string;
}

export const PIZZA_SELECTIONS = {
  cheese_crust: {
    type: "pizza_crust",
    sourceProductId: PIZZA_CRUST_SOURCE_PRODUCT_ID,
    nameBg: "Кашкавален борд",
    nameEn: "Cheese crust",
  },
  philadelphia_crust: {
    type: "pizza_crust",
    sourceProductId: PIZZA_CRUST_SOURCE_PRODUCT_ID,
    nameBg: "Филаделфия борд",
    nameEn: "Philadelphia crust",
  },
  sausage_crust: {
    type: "pizza_crust",
    sourceProductId: PIZZA_CRUST_SOURCE_PRODUCT_ID,
    nameBg: "Кренвирш борд",
    nameEn: "Sausage crust",
  },
  pepperoni_crust: {
    type: "pizza_crust",
    sourceProductId: PIZZA_CRUST_SOURCE_PRODUCT_ID,
    nameBg: "Пеперони борд",
    nameEn: "Pepperoni crust",
  },
  meat_addon: {
    type: "pizza_addon",
    sourceProductId: PIZZA_GENERIC_ADDON_SOURCE_PRODUCT_ID,
    nameBg: "Месна добавка",
    nameEn: "Meat add-on",
  },
  dairy_addon: {
    type: "pizza_addon",
    sourceProductId: PIZZA_GENERIC_ADDON_SOURCE_PRODUCT_ID,
    nameBg: "Млечна добавка",
    nameEn: "Dairy add-on",
  },
  fish_addon: {
    type: "pizza_addon",
    sourceProductId: PIZZA_GENERIC_ADDON_SOURCE_PRODUCT_ID,
    nameBg: "Рибна добавка",
    nameEn: "Fish add-on",
  },
  vegetable_addon: {
    type: "pizza_addon",
    sourceProductId: PIZZA_VEGETABLE_ADDON_SOURCE_PRODUCT_ID,
    nameBg: "Зеленчукова добавка",
    nameEn: "Vegetable add-on",
  },
} as const satisfies Record<string, PizzaSelectionDefinition>;

export type PizzaSelectionKey = keyof typeof PIZZA_SELECTIONS;

export function isPizzaSelectionKey(key: string): key is PizzaSelectionKey {
  return Object.prototype.hasOwnProperty.call(PIZZA_SELECTIONS, key);
}

// ── Category helpers ────────────────────────────────────────────────────────

export function isPizzaCategory(categoryId: string): boolean {
  return (PIZZA_CATEGORY_IDS as readonly string[]).includes(categoryId);
}

export function isBurgerCategory(categoryId: string): boolean {
  return categoryId === BURGER_CATEGORY_ID;
}

export function saucesAllowedForCategory(categoryId: string): boolean {
  return !(SAUCE_DENY_CATEGORY_IDS as readonly string[]).includes(categoryId);
}

// ── Product-based keys (burger addons + sauces) ─────────────────────────────

export function burgerAddonKeyFor(productId: string): string {
  return `burger_addon:${productId}`;
}

export function sauceKeyFor(productId: string): string {
  return `sauce:${productId}`;
}

/** Splits a product-based key into its type and embedded product id. */
export function parseProductExtraKey(
  key: string
): { type: "burger_addon" | "sauce"; productId: string } | null {
  if (key.startsWith("burger_addon:")) {
    const productId = key.slice("burger_addon:".length);
    return productId ? { type: "burger_addon", productId } : null;
  }
  if (key.startsWith("sauce:")) {
    const productId = key.slice("sauce:".length);
    return productId ? { type: "sauce", productId } : null;
  }
  return null;
}

// ── Size matching (30/40 см) ────────────────────────────────────────────────

/**
 * Extracts the numeric size from a variant name. Handles "30 см", "30 cm" and
 * combined snapshot names like "30 см / 30 cm". Returns null when the name
 * carries no digits or carries CONFLICTING numbers — callers must treat null
 * as "size unknown" and reject, never fall back to an arbitrary variant.
 */
export function parseVariantSize(name: string | null | undefined): number | null {
  if (!name) return null;
  const groups = name.match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  const unique = new Set(groups.map((g) => Number(g)));
  return unique.size === 1 ? [...unique][0] : null;
}

/**
 * Finds the addon variant matching the main product's size. Returns null
 * unless EXACTLY ONE variant carries that size (no silent first-variant or
 * sortOrder fallback — a wrong price is worse than a rejected order).
 */
export function findVariantForSize<V extends { nameBg: string; nameEn: string }>(
  variants: readonly V[],
  size: number
): V | null {
  const matches = variants.filter(
    (v) => parseVariantSize(v.nameBg) === size || parseVariantSize(v.nameEn) === size
  );
  return matches.length === 1 ? matches[0] : null;
}

// ── Cart line identity ──────────────────────────────────────────────────────

/**
 * Deterministic signature of a set of extra selections: sorted, so the same
 * selections clicked in any order produce the same signature; different sauce
 * quantities or different crusts produce different ones. Empty → "".
 */
export function extrasSignature(
  extras: readonly Pick<ExtraSelection, "key" | "sourceProductId" | "quantity">[]
): string {
  if (extras.length === 0) return "";
  return extras
    .map((e) => `${e.key}@${e.sourceProductId}x${e.quantity}`)
    .sort()
    .join("|");
}

/**
 * Unique cart line id. Without extras this is the legacy
 * `productId` / `productId::variantId` format, so persisted carts from before
 * the extras feature keep their exact line ids.
 */
export function lineIdFor(
  productId: string,
  variantId?: string,
  extras: readonly Pick<ExtraSelection, "key" | "sourceProductId" | "quantity">[] = []
): string {
  const base = variantId ? `${productId}::${variantId}` : productId;
  const sig = extrasSignature(extras);
  return sig ? `${base}::${sig}` : base;
}

// ── Safe extrasJson parsing ─────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOrderItemExtra(value: unknown): value is OrderItemExtra {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.sourceProductId) &&
    (value.sourceVariantId === undefined || isNonEmptyString(value.sourceVariantId)) &&
    typeof value.type === "string" &&
    (EXTRA_TYPES as readonly string[]).includes(value.type) &&
    isNonEmptyString(value.nameBg) &&
    isNonEmptyString(value.nameEn) &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) &&
    value.quantity >= 1 &&
    (value.sizeContext === undefined || isNonEmptyString(value.sizeContext)) &&
    isMoney(value.unitPriceEur) &&
    isMoney(value.unitPriceBgn) &&
    isMoney(value.totalPriceEur) &&
    isMoney(value.totalPriceBgn)
  );
}

/**
 * Parses OrderItem.extrasJson defensively. Legacy rows ("[]"), invalid JSON,
 * non-array roots and malformed entries all degrade to a (partial) empty
 * result — this NEVER throws, so one corrupted row can't take down an admin
 * page listing hundreds of orders.
 */
export function parseOrderItemExtras(json: string | null | undefined): OrderItemExtra[] {
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(isOrderItemExtra);
}
