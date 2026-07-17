import type { Product, ProductVariant } from "@/types/product";

/** One line in the cart: a product (with an optional chosen variant) and quantity. */
export interface CartItem {
  /** Unique line id (product id + selected variant id). */
  lineId: string;
  product: Product;
  /** Chosen size/variant, if the product has variants. */
  selectedVariant?: ProductVariant;
  quantity: number;
  /** Unit price in EUR (variant price or product base price). */
  unitPrice: number;
  note?: string;
}

export interface CartTotals {
  itemsCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
}
