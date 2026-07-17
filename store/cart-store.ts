"use client";

import { create } from "zustand";
import type { CartItem, CartTotals } from "@/types/cart";
import { DELIVERY_FEE } from "@/lib/constants";

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  totals: () => CartTotals;
}

/**
 * Cart state. Placeholder logic for Stage 2 — persistence (localStorage) and
 * option de-duplication will be added when the cart feature is built.
 */
export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (item) =>
    set((state) => ({ items: [...state.items, item] })),

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
    const deliveryFee = itemsCount > 0 ? DELIVERY_FEE : 0;
    return { itemsCount, subtotal, deliveryFee, total: subtotal + deliveryFee };
  },
}));
