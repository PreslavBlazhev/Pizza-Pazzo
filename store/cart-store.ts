"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartExtraSelection, CartItem, CartTotals } from "@/types/cart";
import type { Product, ProductVariant } from "@/types/product";
import { lineIdFor } from "@/lib/extras-rules";
import { DELIVERY_FEE, EUR_TO_BGN } from "@/lib/constants";

interface CartState {
  items: CartItem[];
  /** Adds a product (optionally a chosen variant + extras). Merges by line, bumping qty. */
  addProduct: (
    product: Product,
    variant?: ProductVariant,
    quantity?: number,
    extras?: CartExtraSelection[]
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

/** BGN unit price for a line: the variant's price, or the product base price. */
function bgnUnit(item: CartItem): number {
  return item.selectedVariant?.priceBgn ?? item.product.priceBgn;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * PREVIEW extras total per one main unit, from the display snapshots captured
 * at add time. UI-only — the checkout server re-derives real prices from the
 * database; an extra without a display snapshot simply previews as 0.
 */
export function extrasPreviewUnitEur(item: CartItem): number {
  return round2(
    (item.extras ?? []).reduce((s, e) => s + (e.display?.unitPriceEur ?? 0) * e.quantity, 0)
  );
}

export function extrasPreviewUnitBgn(item: CartItem): number {
  return round2(
    (item.extras ?? []).reduce((s, e) => s + (e.display?.unitPriceBgn ?? 0) * e.quantity, 0)
  );
}

/** PREVIEW line totals including extras: (base unit + extras unit) × quantity. */
export function linePreviewTotalEur(item: CartItem): number {
  return round2(round2(item.unitPrice + extrasPreviewUnitEur(item)) * item.quantity);
}

export function linePreviewTotalBgn(item: CartItem): number {
  return round2(round2(bgnUnit(item) + extrasPreviewUnitBgn(item)) * item.quantity);
}

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

/**
 * Migrates any persisted "pp-cart" payload (including the unversioned pre-1
 * format, which had no `extras` field) to the current shape. Structurally
 * broken items are dropped rather than crashing the store; a completely
 * invalid payload yields an empty cart.
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
      typeof product.priceEur !== "number" ||
      typeof product.priceBgn !== "number"
    ) {
      continue;
    }
    const quantity =
      typeof raw.quantity === "number" && Number.isInteger(raw.quantity) && raw.quantity >= 1
        ? raw.quantity
        : 1;
    const variant =
      isRecord(raw.selectedVariant) && typeof raw.selectedVariant.id === "string"
        ? (raw.selectedVariant as unknown as ProductVariant)
        : undefined;
    const extras = normalizeExtras(raw.extras);
    const typedProduct = product as unknown as Product;

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
          const lineId = lineIdFor(product.id, variant?.id, extras);
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
            extras,
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
        // Line totals include the extras PREVIEW prices (display snapshots);
        // the authoritative totals are recomputed server-side at checkout.
        const subtotal = items.reduce((s, i) => round2(s + linePreviewTotalEur(i)), 0);
        const subtotalBgn = items.reduce((s, i) => round2(s + linePreviewTotalBgn(i)), 0);
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
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist only the items; methods are recreated on each load.
      partialize: (state) => ({ items: state.items }),
      // Runs for every persisted payload with version < 1 — i.e. all carts
      // saved before the extras feature (they were stored without a version).
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
