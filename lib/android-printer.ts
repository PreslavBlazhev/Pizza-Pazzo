/**
 * Bridge helpers for the Pizza Pazzo Kitchen Android app (android-kitchen-app).
 *
 * The app wraps the live-orders board in a WebView and injects a
 * `window.AndroidPrinter` object (see android-kitchen-app/.../JavascriptBridge.kt).
 * Print jobs are asynchronous: `printOrder(json)` returns immediately and the
 * outcome arrives as a `pizza-pazzo-print-result` CustomEvent on `window`.
 *
 * Everything here is client-side only — always call from "use client"
 * components, never during SSR (there is no `window` on the server).
 */

import { toOrderExtrasDisplay, withPerUnitHint } from "@/lib/order-extras-display";
import type { OrderWithItems } from "@/types/order";

/** UI lifecycle of one print attempt. */
export type PrintState = "IDLE" | "CONNECTING" | "PRINTING" | "SUCCESS" | "ERROR";

/** CustomEvent name the Android app dispatches with the print outcome. */
export const PRINT_RESULT_EVENT = "pizza-pazzo-print-result";

/** Shape of `event.detail` in a print-result event. */
export interface PrintResultDetail {
  orderId: string;
  success: boolean;
  message: string;
  reason?: string | null;
}

interface AndroidPrinterBridge {
  isAvailable(): boolean;
  getPrinterStatus(): string;
  openPrinterSettings(): void;
  printOrder(orderJson: string): void;
  printTestPage(): void;
  disconnectPrinter(): void;
}

declare global {
  interface Window {
    AndroidPrinter?: AndroidPrinterBridge;
  }
}

/** True only inside the kitchen app's WebView with the bridge attached. */
export function isAndroidPrinterAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.AndroidPrinter &&
    typeof window.AndroidPrinter.printOrder === "function"
  );
}

/**
 * Adapts the site's real order shape to the JSON the Android app's
 * PrintableOrder parser expects. Prices are sent in EUR (primary) with the BGN
 * total as secondary — same convention as the on-screen UI.
 *
 * Extras map onto the app's existing `Item.extras` array (see
 * android-kitchen-app/.../models/PrintableOrder.kt: `Extra(name, quantity,
 * price)`). ReceiptFormatter already prints `+ {quantity}x {name} ({price})`,
 * so the quantity stays in its own field — never baked into the name — and
 * `price` is the extra's total for that quantity on ONE unit of the dish,
 * matching what the parenthesised amount means on the receipt. Internal
 * identifiers (key, sourceProductId, sourceVariantId) are never sent.
 */
export function buildPrintableOrderJson(order: OrderWithItems, isReprint = false): string {
  return JSON.stringify({
    orderId: order.id,
    orderNumber: String(order.orderNumber),
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    estimatedMinutes: order.estimatedTimeMinutes,
    customer: {
      name: order.customerName,
      phone: order.customerPhone,
      email: order.customerEmail || null,
    },
    delivery: {
      type: order.deliveryMethod,
      address: order.deliveryAddress,
      city: order.deliveryCity,
    },
    items: order.items.map((item) => ({
      name: item.productNameBg,
      quantity: item.quantity,
      size: item.variantName,
      unitPrice: item.unitPriceEur,
      totalPrice: item.totalPriceEur,
      // Always an array (never undefined) — the Kotlin parser expects one.
      extras: toOrderExtrasDisplay(item.extras, "bg").map((e) => ({
        name: withPerUnitHint(e.name, item.quantity),
        quantity: e.quantity,
        price: e.totalPriceEur,
      })),
      note: item.itemNote,
    })),
    paymentMethod: order.paymentMethod,
    customerNote: order.deliveryNote,
    subtotal: order.subtotalEur,
    deliveryFee: order.deliveryFeeEur,
    discount: 0,
    total: order.totalEur,
    currency: "EUR",
    totalSecondary: order.totalBgn,
    secondaryCurrency: "лв",
    isReprint,
  });
}

/** Requests a print; the result arrives via PRINT_RESULT_EVENT. */
export function requestOrderPrint(order: OrderWithItems, isReprint = false): boolean {
  if (!isAndroidPrinterAvailable()) return false;
  window.AndroidPrinter!.printOrder(buildPrintableOrderJson(order, isReprint));
  return true;
}
