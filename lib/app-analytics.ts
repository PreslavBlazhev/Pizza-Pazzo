/**
 * Shop analytics for the Pizza Pazzo Android app (Google Analytics 4 through
 * Firebase).
 *
 * ARCHITECTURE — ONE REPORTER PER ACTION. The app is a WebView onto this site.
 * It sees URLs, not baskets, so it cannot know what was added or whether an
 * order really went through; this site does. So the site describes the shop
 * events and hands them to the app over `window.AndroidAnalytics` (see
 * android-app/.../webview/AnalyticsBridge.kt), and the app alone talks to
 * Google. Page views are the app's own job (it reads them off navigation).
 *
 *  - In a browser there is no bridge, and every function here does nothing:
 *    the website has NO analytics of its own (see content/legal/cookies.ts).
 *  - Inside the app the bridge is the only path, so one action is reported
 *    once. IF the website ever gets its own GA4 tag (gtag.js), it must stay
 *    silent inside the app — check `isInAndroidApp()` before loading it — or
 *    every in-app action would be counted twice.
 *  - A purchase carries the order number as `transaction_id`. The app keeps
 *    a ledger of reported numbers and refuses a repeat, and this file keeps a
 *    second one in localStorage, so a reloaded thank-you page is not a second
 *    sale.
 *
 * CONSENT lives in the app: nothing is reported unless the user allowed it in
 * the app's dialog — `isEnabled()` is false otherwise and events are dropped.
 *
 * PRIVACY: only product data and sums leave — never the customer's name,
 * e-mail, phone, address or note. The app re-checks every event against an
 * allowlist (AnalyticsEventSanitizer.kt) anyway.
 *
 * The builders at the top are pure and also run on the server; the bridge
 * calls at the bottom are client-only and safe to call during SSR (no-ops).
 */
import type { CartItem } from "@/types/cart";
import type { Order } from "@/types/order";
import type { Product, ProductVariant } from "@/types/product";
import { linePreviewTotalEur, lineUnitPreviewEur, cartTotals } from "./cart-totals";

export const ANALYTICS_CURRENCY = "EUR";

/** GA4 item, as the app's sanitizer accepts it. */
export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_variant?: string;
  item_category?: string;
  price: number;
  quantity: number;
}

export interface EcommerceParams {
  currency: typeof ANALYTICS_CURRENCY;
  value: number;
  items: AnalyticsItem[];
}

export interface PurchaseParams extends EcommerceParams {
  transaction_id: string;
  shipping: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Item names are reported in Bulgarian whatever the page language, so one
 *  pizza is one row in the reports. */
function bgName(names: { bg?: string } | undefined, fallback: string): string {
  return names?.bg || fallback;
}

// ── Builders (pure) ─────────────────────────────────────────────────────────

/** One product as viewed on its page: base price, first (default) size. */
export function viewItemParams(product: Product, variant?: ProductVariant): EcommerceParams {
  const price = round2(variant?.priceEur ?? product.priceEur);
  return {
    currency: ANALYTICS_CURRENCY,
    value: price,
    items: [
      {
        item_id: product.id,
        item_name: bgName(product.names, product.name),
        ...(variant ? { item_variant: bgName(variant.names, variant.name) } : {}),
        item_category: product.categoryId,
        price,
        quantity: 1,
      },
    ],
  };
}

function cartItem(line: CartItem): AnalyticsItem {
  const variant = line.selectedVariant;
  return {
    item_id: line.product.id,
    item_name: bgName(line.product.names, line.product.name),
    ...(variant ? { item_variant: bgName(variant.names, variant.name) } : {}),
    item_category: line.product.categoryId,
    // Per unit WITH the chosen extras — what one of these actually costs.
    price: lineUnitPreviewEur(line),
    quantity: line.quantity,
  };
}

/** What was just put in the basket (a line as the basket now stores it). */
export function addToCartParams(line: CartItem): EcommerceParams {
  return {
    currency: ANALYTICS_CURRENCY,
    value: linePreviewTotalEur(line),
    items: [cartItem(line)],
  };
}

/** The basket at the moment checkout opens; null for an empty one. */
export function beginCheckoutParams(items: readonly CartItem[]): EcommerceParams | null {
  if (items.length === 0) return null;
  return {
    currency: ANALYTICS_CURRENCY,
    value: cartTotals(items).total,
    items: items.slice(0, 50).map(cartItem),
  };
}

/**
 * The purchase for an order — or null when it must NOT be reported.
 *
 * A purchase is a real sale the restaurant accepted:
 *  - never a test order (payment simulator / bank sandbox);
 *  - never a cancelled order;
 *  - a card order only once the bank confirmed the payment AND it went to
 *    the kitchen (a payment confirmed late is held for staff, and may be
 *    refunded — not a sale yet);
 *  - a cash order once the server has created it (that is the moment the
 *    customer is told "received", and the kitchen sees it).
 *
 * Amounts are the SERVER's, from the database, not the basket preview.
 */
export function purchaseParams(order: Order): PurchaseParams | null {
  if (order.isTest) return null;
  if (order.status === "CANCELLED") return null;
  if (!order.releasedToKitchenAt) return null;
  if (order.paymentMethod === "CARD_ONLINE" && order.paymentStatus !== "PAID") return null;

  const lines = order.items ?? [];
  if (lines.length === 0) return null;

  return {
    transaction_id: String(order.orderNumber),
    currency: ANALYTICS_CURRENCY,
    value: round2(order.totalEur),
    shipping: 0, // delivery is free
    items: lines.slice(0, 50).map((line) => ({
      item_id: line.productId,
      item_name: line.productNameBg,
      ...(line.variantName ? { item_variant: line.variantName } : {}),
      price: line.quantity > 0 ? round2(line.totalPriceEur / line.quantity) : 0,
      quantity: line.quantity,
    })),
  };
}

// ── Bridge (client only) ────────────────────────────────────────────────────

export type AppAnalyticsEvent =
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "login"
  | "sign_up";

/** "granted" | "denied" | "unknown" | "unavailable" */
export type AppAnalyticsConsent = "granted" | "denied" | "unknown" | "unavailable";

/** CustomEvent the app dispatches on `window` when the decision changes. */
export const APP_ANALYTICS_CONSENT_EVENT = "pizza-pazzo-analytics-consent";

interface AndroidAnalyticsBridge {
  isEnabled(): boolean;
  getConsentState(): string;
  logEvent(name: string, paramsJson: string): boolean;
  openConsentSettings(): void;
}

declare global {
  interface Window {
    AndroidAnalytics?: AndroidAnalyticsBridge;
  }
}

function bridge(): AndroidAnalyticsBridge | null {
  if (typeof window === "undefined") return null;
  const b = window.AndroidAnalytics;
  return b && typeof b.logEvent === "function" ? b : null;
}

/** True inside the Android app (a version with analytics), on any page. */
export function isInAndroidApp(): boolean {
  return bridge() !== null;
}

/** True when an event sent now would be reported: in the app, with consent. */
export function isAppAnalyticsEnabled(): boolean {
  try {
    return bridge()?.isEnabled() === true;
  } catch {
    return false;
  }
}

export function appAnalyticsConsent(): AppAnalyticsConsent {
  try {
    const state = bridge()?.getConsentState();
    return state === "granted" || state === "denied" || state === "unknown" ? state : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Opens the app's own consent dialog (where consent is given or withdrawn). */
export function openAppAnalyticsSettings(): void {
  try {
    bridge()?.openConsentSettings();
  } catch {
    /* the button is simply inert outside the app */
  }
}

/** Sends one event to the app. Never throws; returns whether it was logged. */
export function trackAppEvent(name: AppAnalyticsEvent, params: object = {}): boolean {
  const b = bridge();
  if (!b) return false;
  try {
    if (!b.isEnabled()) return false;
    return b.logEvent(name, JSON.stringify(params)) === true;
  } catch {
    return false;
  }
}

const PURCHASES_KEY = "pp_analytics_purchases";

/**
 * Reports a purchase at most once per order on this device. The app keeps
 * the authoritative ledger; this one just avoids asking it again.
 */
export function trackAppPurchase(params: PurchaseParams): boolean {
  if (!isAppAnalyticsEnabled()) return false;
  let seen: string[] = [];
  try {
    seen = JSON.parse(window.localStorage.getItem(PURCHASES_KEY) ?? "[]");
    if (!Array.isArray(seen)) seen = [];
  } catch {
    seen = [];
  }
  if (seen.includes(params.transaction_id)) return false;
  const logged = trackAppEvent("purchase", params);
  // Remembered whether or not the app logged it: a "no" from the app means
  // it already has this order (or refused it), never "try again".
  try {
    window.localStorage.setItem(PURCHASES_KEY, JSON.stringify([...seen, params.transaction_id].slice(-100)));
  } catch {
    /* storage unavailable — the app's ledger still guards */
  }
  return logged;
}
