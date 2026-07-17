/**
 * Menu data access layer.
 *
 * For now this reads static JSON from /data. When the database is introduced
 * (docs/database-plan.md) these functions become the single place to swap the
 * source — the UI keeps calling the same helpers.
 */
import categoriesJson from "@/data/categories.json";
import menuJson from "@/data/pizza-pazzo-menu.json";
import type { Category } from "@/types/category";
import type { Product } from "@/types/product";

const categories = categoriesJson as Category[];
const products = menuJson as Product[];

/** Active categories, sorted by sortOrder. */
export function getCategories(): Category[] {
  return categories
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

/** All products, sorted by category order then in-category sortOrder. */
export function getProducts(): Product[] {
  const order = new Map(categories.map((c) => [c.id, c.sortOrder]));
  return [...products].sort((a, b) => {
    const ca = order.get(a.categoryId) ?? 0;
    const cb = order.get(b.categoryId) ?? 0;
    return ca - cb || a.sortOrder - b.sortOrder;
  });
}

export function getProductsByCategory(categoryId: string): Product[] {
  return products
    .filter((p) => p.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

/** Resolve a product by slug first, then by id (used by /product/[id]). */
export function findProduct(idOrSlug: string): Product | undefined {
  return getProductBySlug(idOrSlug) ?? getProductById(idOrSlug);
}

export function getPopularProducts(): Product[] {
  return products.filter((p) => p.isPopular);
}
