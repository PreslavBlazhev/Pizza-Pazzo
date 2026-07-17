/**
 * A selectable variant of a product (e.g. pizza "Малка" / "Голяма").
 * Prices are stored explicitly per variant in both currencies.
 */
export interface ProductVariant {
  id: string;
  name: string;
  priceBgn: number;
  priceEur: number;
}

/** A menu product (pizza, pasta, drink, dessert, ...). */
export interface Product {
  id: string;
  name: string;
  /** URL-friendly identifier used in /product/[id]. */
  slug: string;
  description: string;
  categoryId: string;
  /** Base price in BGN (лв.). For products with variants this is the "from" price. */
  priceBgn: number;
  /** Base price in EUR (€). For products with variants this is the "from" price. */
  priceEur: number;
  /** Path to the product image. Always read the image from here (never hardcode). */
  imageUrl: string;
  /** Allergen ids — must match ids in data/allergens.json. */
  allergens: string[];
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
