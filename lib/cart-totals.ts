/**
 * The basket's money, as the customer sees it in the basket and at checkout.
 *
 * A PREVIEW: prices come from the snapshots taken when each line was added.
 * The server recomputes every amount from the database at checkout with the
 * same rules — the same pizza-math function and the same minimum check — so
 * the two agree whenever the menu has not changed in between.
 *
 * Pure and dependency-free (relative imports only), so the tests can call it.
 */
import type { CartItem, CartTotals } from "../types/cart";
import { PIZZA_CATEGORY_IDS } from "./extras-rules";
import { pizzaMathDiscount } from "./pizza-math";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** PREVIEW extras total per one main unit (display snapshots; missing → 0). */
export function extrasPreviewUnitEur(item: CartItem): number {
  return round2(
    (item.extras ?? []).reduce((s, e) => s + (e.display?.unitPriceEur ?? 0) * e.quantity, 0)
  );
}

/** PREVIEW price of ONE unit of the line: base + its extras. */
export function lineUnitPreviewEur(item: CartItem): number {
  return round2(item.unitPrice + extrasPreviewUnitEur(item));
}

/** PREVIEW line total including extras: (base unit + extras unit) × quantity. */
export function linePreviewTotalEur(item: CartItem): number {
  return round2(round2(item.unitPrice + extrasPreviewUnitEur(item)) * item.quantity);
}

/**
 * Items, „Грешна математика“ discount and the amount to pay. Delivery is
 * free, so `total` is the whole bill — and the base of the delivery minimum.
 */
export function cartTotals(items: readonly CartItem[]): CartTotals {
  const itemsCount = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((s, i) => round2(s + linePreviewTotalEur(i)), 0);
  const discount = pizzaMathDiscount(
    items.map((i) => ({
      categoryId: i.product.categoryId,
      variantName: i.selectedVariant?.names?.bg ?? i.selectedVariant?.name ?? null,
      baseUnitEur: i.unitPrice,
      quantity: i.quantity,
    }))
  ).discountEur;
  const pizzaCount = items.reduce(
    (n, i) => ((PIZZA_CATEGORY_IDS as readonly string[]).includes(i.product.categoryId) ? n + i.quantity : n),
    0
  );
  return { itemsCount, subtotal, discount, total: round2(subtotal - discount), pizzaCount };
}
