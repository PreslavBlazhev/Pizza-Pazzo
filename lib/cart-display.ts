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
