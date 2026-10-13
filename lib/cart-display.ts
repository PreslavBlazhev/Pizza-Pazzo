/**
 * Names on a basket line, in the reader's language.
 *
 * A basket line keeps the product as it was when added. The product carries
 * its name in BOTH languages (`names`, set by lib/menu-data.ts), so switching
 * BG ⇄ EN re-labels the basket instead of leaving it in the language it was
 * filled in. Lines saved before `names` existed fall back to the single name
 * they were stored with.
 *
 * Client-safe and dependency-free.
 */
import type { CartExtraSelection, CartItem } from "../types/cart";
import type { LocalizedText } from "../types/i18n";
import { isAddonOnlyCategory, isRetiredExtraKey } from "./extras-rules";

function pick(text: LocalizedText | undefined, locale: string, fallback: string): string {
  if (!text) return fallback;
  return (locale === "en" ? text.en || text.bg : text.bg || text.en) || fallback;
}

export function cartProductName(item: CartItem, locale: string): string {
  return pick(item.product.names, locale, item.product.name);
}

export function cartVariantName(item: CartItem, locale: string): string | null {
  const v = item.selectedVariant;
  if (!v) return null;
  return pick(v.names, locale, v.name);
}

export function cartExtraName(extra: CartExtraSelection, locale: string): string {
  if (!extra.display) return extra.key;
  return locale === "en" ? extra.display.nameEn || extra.display.nameBg : extra.display.nameBg || extra.display.nameEn;
}

/**
 * Why a basket line cannot go to checkout as it is, or null when it can.
 *
 * - "addon-only": a pizza topping or burger add-on as a line of its own (an
 *   old basket from before 2026-10-13) — add-ons are ordered only ON a pizza
 *   or a burger.
 * - "extras-outdated": the line carries a retired generic option such as
 *   "Месна добавка" — the customer picks the concrete ingredient again; it is
 *   never chosen for them.
 * - "unavailable": the product is no longer on sale (asked of the server).
 *
 * The server refuses all three on its own (lib/checkout/place-order.ts); this
 * only lets the basket say so on the right line, before the form.
 */
export type CartLineIssue = "addon-only" | "extras-outdated" | "unavailable";

export function cartLineIssue(
  item: CartItem,
  unavailable: ReadonlySet<string>
): CartLineIssue | null {
  if (isAddonOnlyCategory(item.product.categoryId)) return "addon-only";
  if (unavailable.has(item.product.id)) return "unavailable";
  if ((item.extras ?? []).some((e) => isRetiredExtraKey(e.key))) return "extras-outdated";
  return null;
}
