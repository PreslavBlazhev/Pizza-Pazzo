/**
 * Server-side extras resolution — the ONLY place that turns client extra
 * selections into priced snapshot entries.
 *
 * Pure and synchronous by design: the caller (app/actions/checkout.ts)
 * pre-fetches the source products from the database and passes them in, so the
 * whole pricing logic is unit-testable without Next.js or Prisma (the smoke
 * test compiles this file standalone — keep it dependency-free, relative
 * imports only, like lib/extras-rules.ts).
 *
 * Trust model: `selections` come from the client and are hostile input. Names,
 * prices and variant matching are derived exclusively from `sourceProducts`
 * (database rows) and the selection definitions in lib/extras-rules.ts.
 */
import {
  BURGER_ADDONS_CATEGORY_ID,
  EXTRAS_LIMITS,
  PIZZA_ADDONS_CATEGORY_ID,
  PIZZA_SELECTIONS,
  SAUCES_CATEGORY_ID,
  findVariantForSize,
  isBurgerCategory,
  isPizzaCategory,
  isPizzaSelectionKey,
  parseProductExtraKey,
  parseVariantSize,
  saucesAllowedForCategory,
  type ExtraSelection,
  type OrderItemExtra,
} from "./extras-rules";

/** DB-derived shape of an extra's pricing source (both languages, plain numbers). */
export interface ExtraSourceVariant {
  id: string;
  nameBg: string;
  nameEn: string;
  priceEur: number;
}

export interface ExtraSourceProduct {
  id: string;
  categoryId: string;
  isAvailable: boolean;
  nameBg: string;
  nameEn: string;
  priceEur: number;
  variants: ExtraSourceVariant[];
}

export interface ResolveExtrasInput {
  /** The main product the extras attach to. */
  mainProduct: { id: string; categoryId: string };
  /** Name of the CHOSEN main variant (e.g. "30 см"); undefined when none. */
  mainVariantName?: string;
  /** Client selections — untrusted. */
  selections: readonly ExtraSelection[];
  /** Pre-fetched source products keyed by id. A missing id ⇒ rejection. */
  sourceProducts: ReadonlyMap<string, ExtraSourceProduct>;
}

/** Machine-readable rejection reasons (internal — not shown to customers). */
export type ResolveExtrasErrorCode =
  | "too-many-extras"
  | "bad-quantity"
  | "unknown-key"
  | "duplicate-selection"
  | "multiple-crusts"
  | "key-product-mismatch"
  | "unknown-product"
  | "unavailable"
  | "wrong-category"
  | "not-allowed-for-product"
  | "no-main-size"
  | "no-size-variant"
  | "sauce-quantity";

export type ResolveExtrasResult =
  | {
      ok: true;
      extras: OrderItemExtra[];
      /** EUR total for ONE unit of the main item (see OrderItemExtra semantics). */
      extrasUnitTotalEur: number;
    }
  | { ok: false; code: ResolveExtrasErrorCode };

const round2 = (n: number) => Math.round(n * 100) / 100;

const fail = (code: ResolveExtrasErrorCode): ResolveExtrasResult => ({ ok: false, code });

/**
 * Validates client extra selections against the business rules and prices them
 * from the given database rows. Returns per-unit snapshot extras + totals.
 */
export function resolveOrderItemExtras(input: ResolveExtrasInput): ResolveExtrasResult {
  const { mainProduct, mainVariantName, selections, sourceProducts } = input;

  if (selections.length === 0) {
    return { ok: true, extras: [], extrasUnitTotalEur: 0 };
  }
  if (selections.length > EXTRAS_LIMITS.maxExtrasPerItem) return fail("too-many-extras");

  // ── Classify + normalize (merge duplicate sauces, reject other duplicates) ──
  const seenKeys = new Set<string>();
  let crustCount = 0;
  const pizzaPicks: { key: string; selection: ExtraSelection }[] = [];
  const burgerPicks: { key: string; productId: string }[] = [];
  // Sauce quantities merged by product id, first-seen order preserved.
  const sauceQty = new Map<string, number>();

  for (const sel of selections) {
    if (!Number.isInteger(sel.quantity) || sel.quantity < 1) return fail("bad-quantity");

    if (isPizzaSelectionKey(sel.key)) {
      const def = PIZZA_SELECTIONS[sel.key];
      if (sel.sourceProductId !== def.sourceProductId) return fail("key-product-mismatch");
      if (sel.quantity !== 1) return fail("bad-quantity");
      if (seenKeys.has(sel.key)) return fail("duplicate-selection");
      seenKeys.add(sel.key);
      if (def.type === "pizza_crust") crustCount++;
      pizzaPicks.push({ key: sel.key, selection: sel });
      continue;
    }

    const parsed = parseProductExtraKey(sel.key);
    if (!parsed) return fail("unknown-key");
    if (parsed.productId !== sel.sourceProductId) return fail("key-product-mismatch");

    if (parsed.type === "burger_addon") {
      if (sel.quantity !== 1) return fail("bad-quantity");
      if (seenKeys.has(sel.key)) return fail("duplicate-selection");
      seenKeys.add(sel.key);
      burgerPicks.push({ key: sel.key, productId: parsed.productId });
      continue;
    }

    // Sauce: duplicates merge by summing quantities (capped below).
    sauceQty.set(parsed.productId, (sauceQty.get(parsed.productId) ?? 0) + sel.quantity);
  }

  if (crustCount > 1) return fail("multiple-crusts");

  // ── What is the main product allowed to carry? ──
  if (pizzaPicks.length > 0 && !isPizzaCategory(mainProduct.categoryId)) {
    return fail("not-allowed-for-product");
  }
  if (burgerPicks.length > 0 && !isBurgerCategory(mainProduct.categoryId)) {
    return fail("not-allowed-for-product");
  }
  if (sauceQty.size > 0 && !saucesAllowedForCategory(mainProduct.categoryId)) {
    return fail("not-allowed-for-product");
  }

  const extras: OrderItemExtra[] = [];

  const getSource = (
    id: string,
    expectedCategoryId: string
  ): ExtraSourceProduct | ResolveExtrasResult => {
    const src = sourceProducts.get(id);
    if (!src || src.id !== id) return fail("unknown-product");
    if (!src.isAvailable) return fail("unavailable");
    if (src.categoryId !== expectedCategoryId) return fail("wrong-category");
    return src;
  };

  // ── Pizza crust + generic addons: price follows the main pizza's size ──
  if (pizzaPicks.length > 0) {
    const mainSize = parseVariantSize(mainVariantName);
    if (mainSize === null) return fail("no-main-size");

    for (const pick of pizzaPicks) {
      const def = PIZZA_SELECTIONS[pick.key as keyof typeof PIZZA_SELECTIONS];
      const src = getSource(def.sourceProductId, PIZZA_ADDONS_CATEGORY_ID);
      if ("ok" in src) return src;

      const variant = findVariantForSize(src.variants, mainSize);
      if (!variant) return fail("no-size-variant");

      extras.push({
        key: pick.key,
        sourceProductId: src.id,
        sourceVariantId: variant.id,
        type: def.type,
        nameBg: def.nameBg,
        nameEn: def.nameEn,
        quantity: 1,
        sizeContext: variant.nameBg,
        unitPriceEur: variant.priceEur,
        totalPriceEur: variant.priceEur,
      });
    }
  }

  // ── Burger addons: flat base price, quantity 1 ──
  for (const pick of burgerPicks) {
    const src = getSource(pick.productId, BURGER_ADDONS_CATEGORY_ID);
    if ("ok" in src) return src;

    extras.push({
      key: pick.key,
      sourceProductId: src.id,
      type: "burger_addon",
      nameBg: src.nameBg,
      nameEn: src.nameEn,
      quantity: 1,
      unitPriceEur: src.priceEur,
      totalPriceEur: src.priceEur,
    });
  }

  // ── Sauces: flat base price × quantity (1..max, after duplicate merge) ──
  for (const [productId, quantity] of sauceQty) {
    if (quantity < 1 || quantity > EXTRAS_LIMITS.maxSauceQuantity) return fail("sauce-quantity");
    const src = getSource(productId, SAUCES_CATEGORY_ID);
    if ("ok" in src) return src;

    extras.push({
      key: `sauce:${productId}`,
      sourceProductId: src.id,
      type: "sauce",
      nameBg: src.nameBg,
      nameEn: src.nameEn,
      quantity,
      unitPriceEur: src.priceEur,
      totalPriceEur: round2(src.priceEur * quantity),
    });
  }

  // Duplicate-sauce merging can only shrink the list, but re-check the cap so
  // the invariant holds no matter how the code above evolves.
  if (extras.length > EXTRAS_LIMITS.maxExtrasPerItem) return fail("too-many-extras");

  let extrasUnitTotalEur = 0;
  for (const e of extras) {
    extrasUnitTotalEur = round2(extrasUnitTotalEur + e.totalPriceEur);
  }

  return { ok: true, extras, extrasUnitTotalEur };
}
