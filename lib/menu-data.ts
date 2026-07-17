/**
 * Menu data access layer.
 *
 * For now this reads static JSON from /data. When the database is introduced
 * (docs/database-plan.md) these functions become the single place to swap the
 * source — the UI keeps calling the same helpers.
 *
 * This is also where localization happens. The JSON stores every name and
 * description as `{ bg, en }`; every function here takes a `locale` and hands
 * back plain strings, so components never deal with translation objects. Adding
 * a third language means touching this file and the data, not the UI.
 */
import categoriesJson from "@/data/categories.json";
import menuJson from "@/data/pizza-pazzo-menu.json";
import type { Category, RawCategory } from "@/types/category";
import type { Product, ProductVariant, RawProduct } from "@/types/product";
import type { LocalizedText } from "@/types/i18n";
import { routing, type Locale } from "@/i18n/routing";

const rawCategories = categoriesJson as RawCategory[];
const rawProducts = menuJson as RawProduct[];

/**
 * Picks one language out of a stored text.
 *
 * Falls back to Bulgarian rather than showing an empty slot: a dish with no
 * English name yet should still be orderable under its Bulgarian one.
 */
function pick(text: LocalizedText | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] || text[routing.defaultLocale] || "";
}

function resolveCategory(raw: RawCategory, locale: Locale): Category {
  return {
    ...raw,
    name: pick(raw.name, locale),
    description: raw.description ? pick(raw.description, locale) : undefined,
  };
}

function resolveVariant(
  raw: NonNullable<RawProduct["variants"]>[number],
  locale: Locale
): ProductVariant {
  return { ...raw, name: pick(raw.name, locale) };
}

function resolveProduct(raw: RawProduct, locale: Locale): Product {
  return {
    ...raw,
    name: pick(raw.name, locale),
    description: pick(raw.description, locale),
    size: raw.size ? pick(raw.size, locale) : undefined,
    ingredients: raw.ingredients?.map((i) => pick(i, locale)),
    variants: raw.variants?.map((v) => resolveVariant(v, locale)),
  };
}

/** Active categories, sorted by sortOrder. */
export function getCategories(locale: Locale): Category[] {
  return rawCategories
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => resolveCategory(c, locale));
}

export function getCategoryBySlug(
  slug: string,
  locale: Locale
): Category | undefined {
  const found = rawCategories.find((c) => c.slug === slug);
  return found ? resolveCategory(found, locale) : undefined;
}

export function getCategoryById(
  id: string,
  locale: Locale
): Category | undefined {
  const found = rawCategories.find((c) => c.id === id);
  return found ? resolveCategory(found, locale) : undefined;
}

/** All products, sorted by category order then in-category sortOrder. */
export function getProducts(locale: Locale): Product[] {
  const order = new Map(rawCategories.map((c) => [c.id, c.sortOrder]));
  return [...rawProducts]
    .sort((a, b) => {
      const ca = order.get(a.categoryId) ?? 0;
      const cb = order.get(b.categoryId) ?? 0;
      return ca - cb || a.sortOrder - b.sortOrder;
    })
    .map((p) => resolveProduct(p, locale));
}

export function getProductsByCategory(
  categoryId: string,
  locale: Locale
): Product[] {
  return rawProducts
    .filter((p) => p.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => resolveProduct(p, locale));
}

export function getProductById(id: string, locale: Locale): Product | undefined {
  const found = rawProducts.find((p) => p.id === id);
  return found ? resolveProduct(found, locale) : undefined;
}

export function getProductBySlug(
  slug: string,
  locale: Locale
): Product | undefined {
  const found = rawProducts.find((p) => p.slug === slug);
  return found ? resolveProduct(found, locale) : undefined;
}

/** Resolve a product by slug first, then by id (used by /product/[id]). */
export function findProduct(
  idOrSlug: string,
  locale: Locale
): Product | undefined {
  return getProductBySlug(idOrSlug, locale) ?? getProductById(idOrSlug, locale);
}

export function getPopularProducts(locale: Locale): Product[] {
  return rawProducts
    .filter((p) => p.isPopular)
    .map((p) => resolveProduct(p, locale));
}

/**
 * Every product slug, for `generateStaticParams`. No locale needed: slugs are
 * language-independent, which is what lets /product/margarita and
 * /en/product/margarita be the same product.
 */
export function getAllProductSlugs(): string[] {
  return rawProducts.map((p) => p.slug);
}

export function getAllCategorySlugs(): string[] {
  return rawCategories.filter((c) => c.isActive).map((c) => c.slug);
}
