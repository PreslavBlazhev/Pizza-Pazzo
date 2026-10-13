"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartExtraSelection, CartItem, CartTotals } from "@/types/cart";
import type { Product, ProductVariant } from "@/types/product";
import { isAddonOnlyCategory, lineIdFor } from "@/lib/extras-rules";
import { cartTotals } from "@/lib/cart-totals";

interface CartState {
  items: CartItem[];
  /** Adds a product (optionally a chosen variant + extras). Merges by line, bumping qty. */
  addProduct: (
    product: Product,
    variant?: ProductVariant,
    quantity?: number,
    extras?: CartExtraSelection[]
  ) => void;
  /**
   * Replaces a line after it was edited on the product page — same position
   * in the basket; if the edited line now equals another existing line, the
   * two merge instead of duplicating.
   */
  replaceItem: (
    oldLineId: string,
    product: Product,
    variant: ProductVariant | undefined,
    quantity: number,
    extras: CartExtraSelection[]
  ) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  totals: () => CartTotals;
}

/** The slice of the state that actually goes to localStorage (see partialize). */
interface PersistedCart {
  items: CartItem[];
}


/** The server accepts 1–99 per line (lib/checkout/place-order.ts). */
export const MAX_LINE_QUANTITY = 99;
const clampQty = (n: number) => Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(n)));

// The preview money helpers live in lib/cart-totals.ts (pure, testable);
// re-exported here for the components that already import them from the store.
export { extrasPreviewUnitEur, lineUnitPreviewEur, linePreviewTotalEur } from "@/lib/cart-totals";

// ── Persist migration (unknown → PersistedCart, never throws) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keeps only well-formed extra selections; anything else is dropped. */
function normalizeExtras(value: unknown): CartExtraSelection[] {
  if (!Array.isArray(value)) return [];
  const out: CartExtraSelection[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const { key, sourceProductId, quantity } = raw;
    if (
      typeof key === "string" &&
      key.length > 0 &&
      typeof sourceProductId === "string" &&
      sourceProductId.length > 0 &&
      typeof quantity === "number" &&
      Number.isInteger(quantity) &&
      quantity >= 1
    ) {
      out.push({ key, sourceProductId, quantity });
    }
  }
  return out;
}

/** Drops the retired `priceBgn` key from a persisted product/variant object. */
function withoutBgn<T extends Record<string, unknown>>(value: T): T {
  if (!("priceBgn" in value)) return value;
  const rest = { ...value };
  delete rest.priceBgn;
  return rest;
}

/**
 * Migrates any persisted "pp-cart" payload to the current shape: the
 * unversioned pre-1 format (no `extras` field) and version 1 (prices stored in
 * both BGN and EUR) both land here. Structurally broken items are dropped
 * rather than crashing the store; a completely invalid payload yields an empty
 * cart. Retired BGN prices are stripped from the product and its variants, and
 * extras lose their display snapshots (normalizeExtras keeps only the payload),
 * so nothing carrying a лв. price survives the upgrade.
 */
function migratePersistedCart(persisted: unknown): PersistedCart {
  if (!isRecord(persisted) || !Array.isArray(persisted.items)) return { items: [] };

  const items: CartItem[] = [];
  for (const raw of persisted.items) {
    if (!isRecord(raw) || !isRecord(raw.product)) continue;
    const product = raw.product;
    if (
      typeof product.id !== "string" ||
      product.id.length === 0 ||
      typeof product.priceEur !== "number"
    ) {
      continue;
    }
    const quantity =
      typeof raw.quantity === "number" && Number.isInteger(raw.quantity) && raw.quantity >= 1
        ? raw.quantity
        : 1;
    const variant =
      isRecord(raw.selectedVariant) && typeof raw.selectedVariant.id === "string"
        ? (withoutBgn(raw.selectedVariant) as unknown as ProductVariant)
        : undefined;
    const extras = normalizeExtras(raw.extras);
    const typedProduct = {
      ...withoutBgn(product),
      variants: Array.isArray(product.variants)
        ? product.variants.map((v) => (isRecord(v) ? withoutBgn(v) : v))
        : product.variants,
    } as unknown as Product;

    items.push({
      lineId: lineIdFor(typedProduct.id, variant?.id, extras),
      product: typedProduct,
      selectedVariant: variant,
      extras,
      quantity,
      unitPrice:
        typeof raw.unitPrice === "number" && Number.isFinite(raw.unitPrice)
          ? raw.unitPrice
          : variant?.priceEur ?? typedProduct.priceEur,
      note: typeof raw.note === "string" ? raw.note : undefined,
    });
  }
  return { items };
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

      addProduct: (product, variant, quantity = 1, extras = []) =>
        set((state) => {
          // Add-ons are ordered only ON a pizza or a burger, never as a line.
          if (isAddonOnlyCategory(product.categoryId)) return state;
          const lineId = lineIdFor(product.id, variant?.id, extras);
          const existing = state.items.find((i) => i.lineId === lineId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.lineId === lineId
                  ? { ...i, quantity: clampQty(i.quantity + quantity) }
                  : i
              ),
            };
          }
          const item: CartItem = {
            lineId,
            product,
            selectedVariant: variant,
            extras,
            quantity: clampQty(quantity),
            unitPrice: variant?.priceEur ?? product.priceEur,
          };
          return { items: [...state.items, item] };
        }),

      replaceItem: (oldLineId, product, variant, quantity, extras) =>
        set((state) => {
          if (isAddonOnlyCategory(product.categoryId)) return state;
          const lineId = lineIdFor(product.id, variant?.id, extras);
          const item: CartItem = {
            lineId,
            product,
            selectedVariant: variant,
            extras,
            quantity: clampQty(quantity),
            unitPrice: variant?.priceEur ?? product.priceEur,
          };
          const twin = state.items.find((i) => i.lineId === lineId && i.lineId !== oldLineId);
          if (twin) {
            // The edit made this line identical to another one: merge.
            return {
              items: state.items
                .filter((i) => i.lineId !== oldLineId)
                .map((i) =>
                  i.lineId === lineId ? { ...i, quantity: clampQty(i.quantity + item.quantity) } : i
                ),
            };
          }
          if (!state.items.some((i) => i.lineId === oldLineId)) {
            return { items: [...state.items, item] };
          }
          return { items: state.items.map((i) => (i.lineId === oldLineId ? item : i)) };
        }),

      removeItem: (lineId) =>
        set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),

      updateQuantity: (lineId, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.lineId === lineId ? { ...i, quantity: clampQty(quantity) } : i
          ),
        })),

      clear: () => set({ items: [] }),

      // Preview prices incl. extras and the „Грешна математика“ discount;
      // the server recomputes all of it at checkout (lib/cart-totals.ts).
      totals: () => cartTotals(get().items),
    }),
    {
      name: "pp-cart",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Persist only the items; methods are recreated on each load.
      partialize: (state) => ({ items: state.items }),
      // Runs for every persisted payload with version < 2 — i.e. carts saved
      // before the extras feature (unversioned) and version-1 carts, which
      // still carried BGN prices.
      migrate: (persistedState) => migratePersistedCart(persistedState),
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
