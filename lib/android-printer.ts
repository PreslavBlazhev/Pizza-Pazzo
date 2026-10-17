/**
 * Bridge helpers for the Pizza Pazzo Android app (android-app).
 *
 * The app wraps the live-orders board in a WebView and injects a
 * `window.AndroidPrinter` object (see android-app/.../JavascriptBridge.kt).
 * Print jobs are asynchronous: `printOrder(json)` returns immediately and the
 * outcome arrives as a `pizza-pazzo-print-result` CustomEvent on `window`.
 *
 * Everything here is client-side only — always call from "use client"
 * components, never during SSR (there is no `window` on the server).
 */

import { withPerUnitHint } from "@/lib/order-extras-display";
import { buildTicketModel } from "@/lib/printer/ticket-model";
import { comboSizesLabel } from "@/lib/pizza-math";
import { offerAdjustment } from "@/lib/offer-display";
import { collectInstructionBg } from "@/lib/payments/status";
import type { OrderWithItems } from "@/types/order";
import { PRINT_SECTIONS, type PrintTemplateData } from "@/types/print";

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

/** True only inside the app's WebView, on a staff page, with the bridge attached. */
export function isAndroidPrinterAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.AndroidPrinter &&
    typeof window.AndroidPrinter.printOrder === "function"
  );
}

/**
 * Adapts the site's real order shape to the JSON the Android app's
 * PrintableOrder parser expects. Prices are sent in EUR, the only currency —
 * same convention as the on-screen UI.
 *
 * Extras map onto the app's existing `Item.extras` array (see
 * android-app/.../models/PrintableOrder.kt: `Extra(name, quantity,
 * price)`). ReceiptFormatter already prints `+ {quantity}x {name} ({price})`,
 * so the quantity stays in its own field — never baked into the name — and
 * `price` is the extra's total for that quantity on ONE unit of the dish,
 * matching what the parenthesised amount means on the receipt. Internal
 * identifiers (key, sourceProductId, sourceVariantId) are never sent.
 *
 * The `print` block carries the layout the owner configured in
 * /admin/settings/print. It is OPTIONAL on the wire: an older build of the
 * app ignores the extra key and keeps printing its built-in layout,
 * and a newer app falls back to that layout when the block is absent. Note
 * that `fontPt` is deliberately NOT sent — a thermal printer has no points,
 * only the 1×–4× `scale`.
 */
export interface PrintableOrderOptions {
  isReprint?: boolean;
  /** Layout for this ticket; omitted → the app's built-in layout. */
  template?: PrintTemplateData;
}

function buildPrintBlock(template: PrintTemplateData) {
  return {
    templateId: template.id,
    name: template.name,
    charsPerLine: template.charsPerLine,
    showDividers: template.showDividers,
    feedLinesAfter: template.feedLinesAfter,
    autoCut: template.autoCut,
    copies: template.copies,
    headerText: template.headerText,
    footerText: template.footerText,
    sections: Object.fromEntries(
      PRINT_SECTIONS.map((section) => {
        const style = template.sections[section.id];
        return [
          section.id,
          {
            visible: style.visible,
            scale: style.scale,
            align: style.align,
            bold: style.bold,
          },
        ];
      })
    ),
  };
}

export function buildPrintableOrderJson(
  order: OrderWithItems,
  options: PrintableOrderOptions = {}
): string {
  const { isReprint = false, template } = options;
  // The same grouped, labelled list the web ticket prints (ticket-model):
  // pizzas first, "Категория: Име" on every line, sauces summed at the end.
  // The app prints `items` in the order given, so the existing app versions
  // print the new layout without an update; `section` is extra information
  // a newer app may use and older ones ignore.
  const model = buildTicketModel(order);
  const dishItems = model.groups.flatMap((group) =>
    group.lines.map((line) => ({
      name: line.label,
      quantity: line.quantity,
      size: line.size,
      unitPrice: line.quantity > 0 ? Math.round((line.totalPriceEur / line.quantity) * 100) / 100 : 0,
      totalPrice: line.totalPriceEur,
      // Always an array (never undefined) — the Kotlin parser expects one.
      extras: line.extras.map((e) => ({
        name: withPerUnitHint(e.name, line.quantity),
        quantity: e.quantity,
        price: e.totalPriceEur,
      })),
      note: line.note,
      section: "dishes",
      category: line.categoryLabel,
    }))
  );
  const sauceItems = model.sauces.map((sauce) => ({
    name: sauce.label,
    quantity: sauce.quantity,
    size: sauce.size,
    unitPrice: sauce.quantity > 0 ? Math.round((sauce.totalPriceEur / sauce.quantity) * 100) / 100 : 0,
    totalPrice: sauce.totalPriceEur,
    extras: [],
    note: sauce.note,
    section: "sauces",
    category: "Сосове",
  }));
  // The app prints `discount` as "Отстъпка -X" and only when it is positive.
  // When the fixed package prices are ABOVE the regular prices the
  // difference travels as its own line instead, named with the combos, so
  // the ticket's lines still add up to "ОБЩО" and nothing reads "--X".
  const adj = offerAdjustment(order.discountEur);
  const offerItems =
    adj.kind === "surcharge"
      ? [
          {
            name: `Разлика до пакетната цена (${(order.offer ?? []).map((c) => comboSizesLabel(c.sizes)).join(", ")})`,
            quantity: 1,
            size: null,
            unitPrice: adj.amountEur,
            totalPrice: adj.amountEur,
            extras: [],
            note: null,
            section: "offer",
            category: null,
          },
        ]
      : [];
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
      address: order.deliveryMethod === "PICKUP" ? null : order.deliveryAddress,
      city: order.deliveryMethod === "PICKUP" ? null : order.deliveryCity,
    },
    items: [...dishItems, ...sauceItems, ...offerItems],
    paymentMethod: order.paymentMethod,
    // Ready-made instruction for the receipt (app 1.1.0+ prints it; older
    // builds ignore unknown keys and print the method code instead).
    paymentStatus: order.paymentStatus,
    paymentText: collectInstructionBg(
      order.paymentMethod,
      order.paymentStatus,
      `${order.totalEur.toFixed(2)} €`
    ),
    isTest: order.isTest,
    customerNote: order.deliveryNote,
    discount: adj.kind === "discount" ? adj.amountEur : 0,
    total: order.totalEur,
    currency: "EUR",
    isReprint,
    ...(template ? { print: buildPrintBlock(template) } : {}),
  });
}

/**
 * Opens the app's native printer settings screen.
 *
 * Returns false outside the app, where there is nothing to open. The bridge
 * refuses the call unless the page is in the staff area — see
 * JavascriptBridge.openPrinterSettings — so this is safe to call from
 * anywhere; it simply does nothing where it should not work.
 */
export function openAndroidPrinterSettings(): boolean {
  if (!isAndroidPrinterAvailable()) return false;
  window.AndroidPrinter!.openPrinterSettings();
  return true;
}

/**
 * Sends a print job the server already built (GET
 * /api/admin/orders/:id/printable); the result arrives via PRINT_RESULT_EVENT.
 */
export function requestPrintJson(orderJson: string): boolean {
  if (!isAndroidPrinterAvailable()) return false;
  window.AndroidPrinter!.printOrder(orderJson);
  return true;
}

/** Requests a print; the result arrives via PRINT_RESULT_EVENT. */
export function requestOrderPrint(
  order: OrderWithItems,
  options: PrintableOrderOptions = {}
): boolean {
  if (!isAndroidPrinterAvailable()) return false;
  window.AndroidPrinter!.printOrder(buildPrintableOrderJson(order, options));
  return true;
}
