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
  /** Max entries in one cart/order item's extras array — room for every
   *  topping (39), a crust, the free picks and the sauces. */
  maxExtrasPerItem: 60,
  /** Max quantity for a single sauce (crust/addons are always quantity 1). */
  maxSauceQuantity: 10,
  /** Max items in one checkout payload. */
  maxOrderItems: 50,
} as const;

// ── Types ───────────────────────────────────────────────────────────────────

export type ExtraType =
  | "pizza_crust"
  | "pizza_addon"
  | "pizza_free_topping"
  | "burger_addon"
  | "sauce";

const EXTRA_TYPES: readonly ExtraType[] = [
  "pizza_crust",
  "pizza_addon",
  "pizza_free_topping",
  "burger_addon",
  "sauce",
];

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
  totalPriceEur: number;
}

// ── Pizza selection definitions ─────────────────────────────────────────────

/**
 * Pricing source product of the four crusts (stable prod_* id from the
 * seed/DB). The four flavours share one priced product; the customer-facing
 * labels below intentionally differ from the combined DB name — the snapshot
 * stores THESE labels, the DB row only supplies the 30/40 см prices.
 */
export const PIZZA_CRUST_SOURCE_PRODUCT_ID =
  "prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord";

/**
 * The two GENERIC topping products ("Месни / млечни / рибни", "Зеленчукови")
 * that were offered as four vague options until 2026-10-13. They stay in the
 * database for the order history, switched off, and are never offered or
 * accepted again — PIZZA_TOPPINGS replaced them.
 */
export const RETIRED_PIZZA_ADDON_PRODUCT_IDS = [
  "prod_mesni_mlechni_ribni",
  "prod_zelenchukovi",
] as const;

export interface PizzaSelectionDefinition {
  type: "pizza_crust";
  sourceProductId: string;
  nameBg: string;
  nameEn: string;
}

/** The crusts (борд) — single-select, priced by the pizza's size. */
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
} as const satisfies Record<string, PizzaSelectionDefinition>;

export type PizzaSelectionKey = keyof typeof PIZZA_SELECTIONS;

export function isPizzaSelectionKey(key: string): key is PizzaSelectionKey {
  return Object.prototype.hasOwnProperty.call(PIZZA_SELECTIONS, key);
}

// ── Concrete pizza toppings (owner's list, 2026-10-13) ──────────────────────

/**
 * The owner's two price groups. A group is only a HEADING and the price a
 * topping row is CREATED with: every topping is its own MenuProduct with its
 * own 30/40 см variants, so the admin can reprice, rename or switch off one
 * ingredient without touching the rest. Prices are per ONE topping on ONE
 * pizza of that size.
 */
export const PIZZA_TOPPING_GROUPS = {
  vegetable: {
    nameBg: "Зеленчукови добавки",
    nameEn: "Vegetable toppings",
    price30Eur: 2.05,
    price40Eur: 2.56,
  },
  meat_dairy_fish: {
    nameBg: "Месни / млечни / рибни добавки",
    nameEn: "Meat / dairy / fish toppings",
    price30Eur: 2.56,
    price40Eur: 3.07,
  },
} as const;

export type PizzaToppingGroup = keyof typeof PIZZA_TOPPING_GROUPS;

export const PIZZA_TOPPING_GROUP_ORDER: readonly PizzaToppingGroup[] = [
  "vegetable",
  "meat_dairy_fish",
];

export interface PizzaToppingDefinition {
  /** Stable MenuProduct id — the one identifier for BG and EN alike. */
  productId: string;
  /** Slug of the product row (never public: the category is not listed). */
  slug: string;
  group: PizzaToppingGroup;
  /** Names the row is CREATED with; the database copy is what is shown. */
  nameBg: string;
  nameEn: string;
}

const topping = (
  id: string,
  group: PizzaToppingGroup,
  nameBg: string,
  nameEn: string
): PizzaToppingDefinition => ({
  productId: `prod_topping_${id}`,
  slug: `topping-${id.replace(/_/g, "-")}`,
  group,
  nameBg,
  nameEn,
});

/**
 * The 39 concrete toppings, in the owner's order: 15 vegetable (pineapple
 * stays in this group, as the owner sent it) and 24 meat / dairy / fish. The
 * ONLY toppings a customer can pick on a pizza, paid or free.
 */
export const PIZZA_TOPPINGS: readonly PizzaToppingDefinition[] = [
  topping("chervena_chushka", "vegetable", "Червена чушка", "Red pepper"),
  topping("zelena_chushka", "vegetable", "Зелена чушка", "Green pepper"),
  topping("pechena_chushka", "vegetable", "Печена чушка", "Roasted pepper"),
  topping("gabi", "vegetable", "Гъби", "Mushrooms"),
  topping("tsarevitsa", "vegetable", "Царевица", "Sweetcorn"),
  topping("halapenyos", "vegetable", "Халапеньос", "Jalapeños"),
  topping("cherven_luk", "vegetable", "Червен лук", "Red onion"),
  topping("cheri_domati", "vegetable", "Чери домати", "Cherry tomatoes"),
  topping("domati", "vegetable", "Домати", "Tomatoes"),
  topping("rukola", "vegetable", "Рукола", "Rocket"),
  topping("maslini", "vegetable", "Маслини", "Olives"),
  topping("bosilek", "vegetable", "Босилек", "Basil"),
  topping("ananas", "vegetable", "Ананас", "Pineapple"),
  topping("kiseli_krastavichki", "vegetable", "Кисели краставички", "Gherkins"),
  topping("susheni_domati", "vegetable", "Сушени домати", "Sun-dried tomatoes"),
  topping("pileshka_shunka", "meat_dairy_fish", "Пилешка шунка", "Chicken ham"),
  topping("svinska_shunka", "meat_dairy_fish", "Свинска шунка", "Pork ham"),
  topping("pikantno_teleshko", "meat_dairy_fish", "Пикантно телешко", "Spicy beef"),
  topping("peperoni", "meat_dairy_fish", "Пеперони", "Pepperoni"),
  topping("shpek", "meat_dairy_fish", "Шпек", "Speck"),
  topping("lukanka", "meat_dairy_fish", "Луканка", "Lukanka (cured sausage)"),
  topping("krenvirsh", "meat_dairy_fish", "Кренвирш", "Frankfurter"),
  topping("bekon", "meat_dairy_fish", "Бекон", "Bacon"),
  topping("teleshki_burger", "meat_dairy_fish", "Телешки бургер", "Beef burger"),
  topping("yaytse", "meat_dairy_fish", "Яйце", "Egg"),
  topping("racheshki_rultsa", "meat_dairy_fish", "Рачешки рулца", "Crab sticks"),
  topping("riba_ton", "meat_dairy_fish", "Риба тон", "Tuna"),
  topping("anshoa", "meat_dairy_fish", "Аншоа", "Anchovies"),
  topping("kashkaval", "meat_dairy_fish", "Кашкавал", "Kashkaval (yellow cheese)"),
  topping("krave_sirene", "meat_dairy_fish", "Краве сирене", "White cheese (cow’s milk)"),
  topping("motsarela", "meat_dairy_fish", "Моцарела", "Mozzarella"),
  topping("sinyo_sirene", "meat_dairy_fish", "Синьо сирене", "Blue cheese"),
  topping("grana_padano", "meat_dairy_fish", "Грана падано", "Grana Padano"),
  topping("topeno_sirene", "meat_dairy_fish", "Топено сирене", "Processed cheese"),
  topping("filadelfiya", "meat_dairy_fish", "Филаделфия", "Philadelphia"),
  topping("chedar", "meat_dairy_fish", "Чедър", "Cheddar"),
  topping("pushena_syomga", "meat_dairy_fish", "Пушена сьомга", "Smoked salmon"),
  topping("gauda", "meat_dairy_fish", "Гауда", "Gouda"),
  topping("emental", "meat_dairy_fish", "Ементал", "Emmental"),
];

const TOPPINGS_BY_PRODUCT_ID: ReadonlyMap<string, PizzaToppingDefinition> = new Map(
  PIZZA_TOPPINGS.map((t) => [t.productId, t])
);

/** The registry entry for a topping product id; undefined for anything else. */
export function pizzaToppingFor(productId: string): PizzaToppingDefinition | undefined {
  return TOPPINGS_BY_PRODUCT_ID.get(productId);
}

const PIZZA_TOPPING_PREFIX = "pizza_topping:";
const FREE_TOPPING_PREFIX = "free_topping:";

/** Selection key of a PAID topping, e.g. "pizza_topping:prod_topping_gabi". */
export function pizzaToppingKeyFor(productId: string): string {
  return `${PIZZA_TOPPING_PREFIX}${productId}`;
}

/** Selection key of a topping picked as one of the FREE ones ("Моята Пацо"). */
export function freeToppingKeyFor(productId: string): string {
  return `${FREE_TOPPING_PREFIX}${productId}`;
}

/** Splits a topping key; null unless it names a topping in PIZZA_TOPPINGS. */
export function parseToppingKey(
  key: string
): { free: boolean; productId: string; definition: PizzaToppingDefinition } | null {
  const free = key.startsWith(FREE_TOPPING_PREFIX);
  if (!free && !key.startsWith(PIZZA_TOPPING_PREFIX)) return null;
  const productId = key.slice((free ? FREE_TOPPING_PREFIX : PIZZA_TOPPING_PREFIX).length);
  const definition = pizzaToppingFor(productId);
  return definition ? { free, productId, definition } : null;
}

/**
 * Keys of the retired generic options ("Месна добавка", "Безплатна добавка:
 * месна", …). A basket saved before 2026-10-13 can still carry them. They are
 * never priced and never turned into a concrete ingredient on the customer's
 * behalf — the customer is asked to choose again.
 */
export const RETIRED_EXTRA_KEYS = [
  "meat_addon",
  "dairy_addon",
  "fish_addon",
  "vegetable_addon",
  "free_meat_topping",
  "free_dairy_topping",
  "free_fish_topping",
  "free_vegetable_topping",
] as const;

export function isRetiredExtraKey(key: string): boolean {
  return (RETIRED_EXTRA_KEYS as readonly string[]).includes(key);
}

// ── Free toppings (only on products whose price includes them) ──────────────

/**
 * Products whose price INCLUDES a number of toppings of the customer's choice,
 * and how many. Keyed by stable product id — never by name — and deliberately
 * a short explicit list: free toppings are NOT a property of pizzas in
 * general.
 *
 * "Моята Пацо" / "My Pazzo": "маргарита с три добавки по ваш избор" — the
 * restaurant's own menu (Pizza_Pazzo_Digital_Menu_Products_Allergens_Prices
 * .docx), confirmed again by the owner on 2026-10-12 ("до 3 безплатни").
 * The free ones come from the same concrete list as the paid ones
 * (PIZZA_TOPPINGS), each ingredient at most once among the free picks.
 */
export const FREE_TOPPINGS_BY_PRODUCT: Readonly<Record<string, number>> = {
  prod_moyata_patso: 3,
};

/** How many free toppings a product comes with — 0 for every other product. */
export function freeToppingsLimitFor(productId: string): number {
  return Object.prototype.hasOwnProperty.call(FREE_TOPPINGS_BY_PRODUCT, productId)
    ? FREE_TOPPINGS_BY_PRODUCT[productId]
    : 0;
}

/** Name stored on the order for a free topping — the kitchen reads it. */
export function freeToppingNames(topping: { nameBg: string; nameEn: string }): {
  nameBg: string;
  nameEn: string;
} {
  return {
    nameBg: `Безплатна добавка: ${topping.nameBg}`,
    nameEn: `Free topping: ${topping.nameEn}`,
  };
}

// ── Category helpers ────────────────────────────────────────────────────────

/**
 * Categories whose products exist ONLY as add-ons to a pizza or a burger:
 * never listed in the public menu, never a basket or order line of their own.
 * Their rows (names, prices, availability) stay editable in the admin — they
 * are the price source of the extras.
 */
export const ADDON_ONLY_CATEGORY_IDS = [PIZZA_ADDONS_CATEGORY_ID, BURGER_ADDONS_CATEGORY_ID] as const;

export function isAddonOnlyCategory(categoryId: string): boolean {
  return (ADDON_ONLY_CATEGORY_IDS as readonly string[]).includes(categoryId);
}

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
    isMoney(value.totalPriceEur)
  );
}

/**
 * Parses OrderItem.extrasJson defensively. Legacy rows ("[]"), invalid JSON,
 * non-array roots and malformed entries all degrade to a (partial) empty
 * result — this NEVER throws, so one corrupted row can't take down an admin
 * page listing hundreds of orders.
 *
 * Snapshots written before the euro-only change still carry unitPriceBgn /
 * totalPriceBgn keys; they are neither validated nor read, so those rows keep
 * parsing unchanged and the extra keys are simply dropped from the result.
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
  // Rebuilt field by field (not just filtered) so that legacy BGN keys never
  // travel any further than this function.
  return data.filter(isOrderItemExtra).map((e) => ({
    key: e.key,
    sourceProductId: e.sourceProductId,
    ...(e.sourceVariantId === undefined ? {} : { sourceVariantId: e.sourceVariantId }),
    type: e.type,
    nameBg: e.nameBg,
    nameEn: e.nameEn,
    quantity: e.quantity,
    ...(e.sizeContext === undefined ? {} : { sizeContext: e.sizeContext }),
    unitPriceEur: e.unitPriceEur,
    totalPriceEur: e.totalPriceEur,
  }));
}
