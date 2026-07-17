"use client";

import { create } from "zustand";
import type { Order, OrderStatus } from "@/types/order";

interface AdminOrdersState {
  orders: Order[];
  setOrders: (orders: Order[]) => void;
  updateStatus: (id: string, status: OrderStatus, etaMinutes?: number) => void;
  cancelOrder: (id: string, reason: string) => void;
}

/**
 * Admin orders state. Placeholder for Stage 5 — real data will come from the
 * API/database; for now it can be seeded from lib/mock-orders.
 */
export const useAdminOrdersStore = create<AdminOrdersState>((set) => ({
  orders: [],

  setOrders: (orders) => set({ orders }),

  updateStatus: (id, status, etaMinutes) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === id
          ? { ...o, status, etaMinutes: etaMinutes ?? o.etaMinutes, updatedAt: new Date().toISOString() }
          : o
      ),
    })),

  cancelOrder: (id, reason) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === id
          ? { ...o, status: "cancelled", cancellationReason: reason, updatedAt: new Date().toISOString() }
          : o
      ),
    })),
}));
