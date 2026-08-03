"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartExtraSelection, CartItem, CartTotals } from "@/types/cart";
import type { Product, ProductVariant } from "@/types/product";
import { lineIdFor } from "@/lib/extras-rules";
import { DELIVERY_FEE } from "@/lib/constants";

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

/** PREVIEW line total including extras: (base unit + extras unit) × quantity. */
export function linePreviewTotalEur(item: CartItem): number {
  return round2(round2(item.unitPrice + extrasPreviewUnitEur(item)) * item.quantity);
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
        const deliveryFee = itemsCount > 0 ? DELIVERY_FEE : 0;
        return {
          itemsCount,
          subtotal,
          deliveryFee,
          total: subtotal + deliveryFee,
        };
      },
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
