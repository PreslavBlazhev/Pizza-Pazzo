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
import { PIZZA_CATEGORY_IDS, isRetiredExtraKey } from "./extras-rules";
import { pizzaMathDiscount } from "./pizza-math";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Euro amount → whole cents. Money is added up in cents, never in floats. */
const cents = (eur: number) => Math.round(eur * 100);

/** PREVIEW extras total per one main unit (display snapshots; missing → 0).
 *  A retired generic option ("Месна добавка") is shown crossed out and is
 *  never charged, so it is not counted either. */
export function extrasPreviewUnitEur(item: CartItem): number {
  const total = (item.extras ?? []).filter((e) => !isRetiredExtraKey(e.key)).reduce(
    (sum, e) => sum + cents(e.display?.unitPriceEur ?? 0) * e.quantity,
    0
  );
  return total / 100;
}

/** PREVIEW price of ONE unit of the line: base + its extras. */
export function lineUnitPreviewEur(item: CartItem): number {
  return (cents(item.unitPrice) + cents(extrasPreviewUnitEur(item))) / 100;
}

/** PREVIEW line total including extras: (base unit + extras unit) × quantity. */
export function linePreviewTotalEur(item: CartItem): number {
  return (cents(lineUnitPreviewEur(item)) * item.quantity) / 100;
}

/**
 * Items, „Грешна математика“ discount and the amount to pay. Delivery is
 * free, so `total` is the whole bill — and the base of the delivery minimum.
 */
export function cartTotals(items: readonly CartItem[]): CartTotals {
  const itemsCount = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + cents(linePreviewTotalEur(i)), 0) / 100;
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
