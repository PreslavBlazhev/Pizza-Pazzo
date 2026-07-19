import type { LocalizedText } from "./i18n";

/**
 * A selectable variant of a product (e.g. pizza "30 см" / "40 см").
 * Prices are stored explicitly per variant in both currencies.
 */
export interface ProductVariant {
  id: string;
  name: string;
  priceBgn: number;
  priceEur: number;
}

/**
 * A menu product (pizza, pasta, drink, dessert, ...), resolved for one locale.
 *
 * This is what every component receives — `name` and `description` are plain
 * strings in the language the visitor is reading. Get one from
 * `lib/menu-data.ts`, never by importing the JSON directly.
 */
export interface Product {
  id: string;
  name: string;
  /** URL-friendly identifier used in /product/[id]. Never localized: the slug
   *  is the same in both languages, so /en/product/margarita resolves. */
  slug: string;
  description: string;
  categoryId: string;
  /** Base price in BGN (лв.). For products with variants this is the "from" price. */
  priceBgn: number;
  /** Base price in EUR (€). For products with variants this is the "from" price. */
  priceEur: number;
  /** Path to the product image. Always read the image from here (never hardcode). */
  imageUrl: string;
  /** Allergen ids — names live in the `allergens` message namespace. */
  allergens: string[];
  /**
   * True while the kitchen has NOT yet confirmed the allergen list for this
   * product (EU 1169/2011 — the values are our provisional reading, see
   * docs/client-allergens-needed.md). The UI must then say "being confirmed —
   * ask the staff" instead of claiming "no allergens". Delete the flag from
   * `data/pizza-pazzo-menu.json` once the restaurant confirms the product.
   */
  allergensUnverified?: boolean;
  /** Optional list of ingredients shown on the card / detail page. */
  ingredients?: string[];
  /** Optional serving size / weight, e.g. "300 г", "330 мл". */
  size?: string;
  isAvailable: boolean;
  isPopular?: boolean;
  isNew?: boolean;
  /** Sort order within the product's category (ascending). */
  sortOrder: number;
  /** Optional size/variant options (e.g. pizzas with small/large). */
  variants?: ProductVariant[];
}

/** The stored shape in `data/pizza-pazzo-menu.json`, before locale resolution. */
export interface RawProductVariant extends Omit<ProductVariant, "name"> {
  name: LocalizedText;
}

export interface RawProduct
  extends Omit<Product, "name" | "description" | "size" | "variants" | "ingredients"> {
  name: LocalizedText;
  description: LocalizedText;
  size?: LocalizedText;
  ingredients?: LocalizedText[];
  variants?: RawProductVariant[];
}
