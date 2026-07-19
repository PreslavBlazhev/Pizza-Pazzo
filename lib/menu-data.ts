/**
 * Menu data access layer — backed by the DATABASE since 2026-07-18
 * (docs/admin-menu-db-plan.md). The JSON files in /data remain only as the
 * seed/backup that `scripts/import-menu-to-db.mjs` loads; after that import
 * the admin panel edits the DB and this file is the single read path.
 *
 * Reads go through one `unstable_cache` entry tagged MENU_CACHE_TAG: public
 * pages render dynamically but hit the DB only when the cache is cold, and
 * every admin save calls `revalidateTag(MENU_CACHE_TAG)` so the public menu
 * updates immediately (otherwise at most MENU_REVALIDATE_SECONDS late).
 *
 * This is also where localization happens. Rows store `nameBg`/`nameEn`; every
 * function here takes a `locale` and hands back plain strings, so components
 * never deal with translation objects. Adding a third language means touching
 * this file and the schema, not the UI.
 */
import { unstable_cache } from "next/cache";
import { db as prisma } from "@/lib/db";
import type { Category, RawCategory } from "@/types/category";
import type {
  Product,
  ProductVariant,
  RawProduct,
  RawProductVariant,
} from "@/types/product";
import type { LocalizedText } from "@/types/i18n";
import { routing, type Locale } from "@/i18n/routing";

/** Invalidated by every admin menu edit — see `app/actions/admin-menu.ts`. */
export const MENU_CACHE_TAG = "menu";

/** Upper bound on staleness if a revalidateTag call is ever missed. */
const MENU_REVALIDATE_SECONDS = 300;

// ── DB row → Raw (stored) shapes ────────────────────────────────────────────
// The Raw* types are the same ones the JSON seed used, so everything below the
// mapping (locale resolution, sorting, the UI) is untouched by the DB move.

type CategoryRow = Awaited<
  ReturnType<typeof prisma.menuCategory.findMany>
>[number];

function toRawCategory(row: CategoryRow): RawCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: { bg: row.nameBg, en: row.nameEn },
    description:
      row.descriptionBg || row.descriptionEn
        ? { bg: row.descriptionBg, en: row.descriptionEn }
        : undefined,
    icon: row.icon ?? undefined,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

type ProductRow = Awaited<
  ReturnType<typeof prisma.menuProduct.findMany<{ include: { variants: true } }>>
>[number];

function parseAllergens(json: string, productId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((a) => typeof a === "string");
  } catch {
    // fall through
  }
  console.error(`menu-data: unreadable allergens JSON on ${productId}`);
  return [];
}

function toRawProduct(row: ProductRow): RawProduct {
  const variants: RawProductVariant[] = [...row.variants]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({
      id: v.id,
      name: { bg: v.nameBg, en: v.nameEn },
      priceBgn: Number(v.priceBgn),
      priceEur: Number(v.priceEur),
    }));
  return {
    id: row.id,
    slug: row.slug,
    name: { bg: row.nameBg, en: row.nameEn },
    description: { bg: row.descriptionBg, en: row.descriptionEn },
    categoryId: row.categoryId,
    priceBgn: Number(row.priceBgn),
    priceEur: Number(row.priceEur),
    imageUrl: row.imageUrl ?? "",
    allergens: parseAllergens(row.allergens, row.id),
    allergensUnverified: row.allergensUnverified || undefined,
    size:
      row.sizeBg || row.sizeEn
        ? { bg: row.sizeBg ?? "", en: row.sizeEn ?? "" }
        : undefined,
    isAvailable: row.isAvailable,
    isPopular: row.isPopular || undefined,
    isNew: row.isNew || undefined,
    sortOrder: row.sortOrder,
    variants: variants.length > 0 ? variants : undefined,
  };
}

/**
 * The whole menu in one cached read. One entry (not per-locale, not per-query)
 * keeps invalidation trivial and the payload tiny (98 products). unstable_cache
 * requires a JSON-serializable return, which is why Decimal → number happens
 * inside the loader.
 */
const loadMenu = unstable_cache(
  async (): Promise<{ categories: RawCategory[]; products: RawProduct[] }> => {
    const [categories, products] = await Promise.all([
      prisma.menuCategory.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.menuProduct.findMany({
        include: { variants: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    return {
      categories: categories.map(toRawCategory),
      products: products.map(toRawProduct),
    };
  },
  ["menu-data"],
  { tags: [MENU_CACHE_TAG], revalidate: MENU_REVALIDATE_SECONDS }
);

// ── Locale resolution (unchanged from the JSON era) ─────────────────────────

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

function resolveVariant(raw: RawProductVariant, locale: Locale): ProductVariant {
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

// ── Public API (same names as before, now async) ────────────────────────────

/** Active categories, sorted by sortOrder. */
export async function getCategories(locale: Locale): Promise<Category[]> {
  const { categories } = await loadMenu();
  return categories
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => resolveCategory(c, locale));
}

export async function getCategoryBySlug(
  slug: string,
  locale: Locale
): Promise<Category | undefined> {
  const { categories } = await loadMenu();
  const found = categories.find((c) => c.slug === slug);
  return found ? resolveCategory(found, locale) : undefined;
}

export async function getCategoryById(
  id: string,
  locale: Locale
): Promise<Category | undefined> {
  const { categories } = await loadMenu();
  const found = categories.find((c) => c.id === id);
  return found ? resolveCategory(found, locale) : undefined;
}

/** All products, sorted by category order then in-category sortOrder. */
export async function getProducts(locale: Locale): Promise<Product[]> {
  const { categories, products } = await loadMenu();
  const order = new Map(categories.map((c) => [c.id, c.sortOrder]));
  return [...products]
    .sort((a, b) => {
      const ca = order.get(a.categoryId) ?? 0;
      const cb = order.get(b.categoryId) ?? 0;
      return ca - cb || a.sortOrder - b.sortOrder;
    })
    .map((p) => resolveProduct(p, locale));
}

export async function getProductsByCategory(
  categoryId: string,
  locale: Locale
): Promise<Product[]> {
  const { products } = await loadMenu();
  return products
    .filter((p) => p.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => resolveProduct(p, locale));
}

export async function getProductById(
  id: string,
  locale: Locale
): Promise<Product | undefined> {
  const { products } = await loadMenu();
  const found = products.find((p) => p.id === id);
  return found ? resolveProduct(found, locale) : undefined;
}

export async function getProductBySlug(
  slug: string,
  locale: Locale
): Promise<Product | undefined> {
  const { products } = await loadMenu();
  const found = products.find((p) => p.slug === slug);
  return found ? resolveProduct(found, locale) : undefined;
}

/** Resolve a product by slug first, then by id (used by /product/[id]). */
export async function findProduct(
  idOrSlug: string,
  locale: Locale
): Promise<Product | undefined> {
  return (
    (await getProductBySlug(idOrSlug, locale)) ??
    (await getProductById(idOrSlug, locale))
  );
}

export async function getPopularProducts(locale: Locale): Promise<Product[]> {
  const { products } = await loadMenu();
  return products
    .filter((p) => p.isPopular)
    .map((p) => resolveProduct(p, locale));
}
