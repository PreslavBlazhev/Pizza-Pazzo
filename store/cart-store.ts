"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem, CartTotals } from "@/types/cart";
import type { Product, ProductVariant } from "@/types/product";
import { DELIVERY_FEE, EUR_TO_BGN } from "@/lib/constants";

interface CartState {
  items: CartItem[];
  /** Adds a product (optionally a chosen variant). Merges by line, bumping qty. */
  addProduct: (product: Product, variant?: ProductVariant, quantity?: number) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  totals: () => CartTotals;
}

/** A cart line is unique per product + chosen variant. */
function lineIdFor(productId: string, variantId?: string): string {
  return variantId ? `${productId}::${variantId}` : productId;
}

/** BGN unit price for a line: the variant's price, or the product base price. */
function bgnUnit(item: CartItem): number {
  return item.selectedVariant?.priceBgn ?? item.product.priceBgn;
}

/**
 * Cart state, persisted to localStorage ("pp-cart"). Only `items` is stored;
 * the action methods and derived totals are rebuilt on load.
 *
 * IMPORTANT: never read `items` during server render — gate UI behind
 * {@link useCartHydrated} so the server and first client render agree (empty),
 * then reveal the real cart after hydration.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addProduct: (product, variant, quantity = 1) =>
        set((state) => {
          const lineId = lineIdFor(product.id, variant?.id);
          const existing = state.items.find((i) => i.lineId === lineId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.lineId === lineId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          const item: CartItem = {
            lineId,
            product,
            selectedVariant: variant,
            quantity,
            unitPrice: variant?.priceEur ?? product.priceEur,
          };
          return { items: [...state.items, item] };
        }),

      removeItem: (lineId) =>
        set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),

      updateQuantity: (lineId, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.lineId === lineId ? { ...i, quantity: Math.max(1, quantity) } : i
          ),
        })),

      clear: () => set({ items: [] }),

      totals: () => {
        const items = get().items;
        const itemsCount = items.reduce((n, i) => n + i.quantity, 0);
        const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const subtotalBgn = items.reduce((s, i) => s + bgnUnit(i) * i.quantity, 0);
        const deliveryFee = itemsCount > 0 ? DELIVERY_FEE : 0;
        const deliveryFeeBgn = itemsCount > 0 ? DELIVERY_FEE * EUR_TO_BGN : 0;
        return {
          itemsCount,
          subtotal,
          deliveryFee,
          total: subtotal + deliveryFee,
          subtotalBgn,
          deliveryFeeBgn,
          totalBgn: subtotalBgn + deliveryFeeBgn,
        };
      },
    }),
    {
      name: "pp-cart",
      storage: createJSONStorage(() => localStorage),
      // Persist only the items; methods are recreated on each load.
      partialize: (state) => ({ items: state.items }),
    }
  )
);

/**
 * True once the persisted cart has been read on the client. Use it to gate any
 * render that depends on `items`, so SSR (empty) and first client paint match.
 */
export function useCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
