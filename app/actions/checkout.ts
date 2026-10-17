"use server";

import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  TRACK_COOKIE,
  addToTrackCookie,
  parseTrackCookie,
  trackingTokenFor,
} from "@/lib/order-tracking";
import { nextCutoffAfter, retentionNow } from "@/lib/order-retention";
import { getSessionUser } from "@/lib/auth";
import { getCategoryById, getProductById } from "@/lib/menu-data";
import { maybePurgeExpiredOrders } from "@/lib/order-purge";
import { getStoreStatus } from "@/lib/store-status";
import { findOrderForCheckoutKey, placeOrder } from "@/lib/checkout/place-order";
import { orderReceipt } from "@/lib/checkout/receipt";
import { isLocale } from "@/i18n/routing";
import { DELIVERY_AREA } from "@/lib/delivery-area";
import { formatEurPrice } from "@/lib/format-price";

/**
 * Checkout — the server action behind the checkout form.
 *
 * Only the request-bound parts live here (open/closed check, session,
 * language of the messages); the order itself is built by
 * lib/checkout/place-order.ts, which re-derives every price on the server,
 * enforces the delivery area and the explicit confirmations, and handles both
 * payment methods and idempotency.
 */

export interface CheckoutResult {
  ok: boolean;
  orderNumber?: number;
  /** "CARD_ONLINE" → continue to /checkout/pay/{accessToken}; cash is done. */
  paymentMethod?: "CASH_ON_DELIVERY" | "CARD_ONLINE";
  accessToken?: string;
  /** Signed proof for the confirmation page (lib/checkout/receipt.ts). */
  receipt?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createOrder(
  _prev: CheckoutResult | null,
  formData: FormData
): Promise<CheckoutResult> {
  // The refusals come back as codes; say them in the customer's language.
  const rawLocale = formData.get("locale");
  const locale = isLocale(rawLocale) ? rawLocale : "bg";
  const t = await getTranslations({ locale, namespace: "checkout.errors" });
  // The browser's anonymous attempt id (lib/checkout/trace.ts) — only to
  // match this request's log line with a trail the browser reports later.
  const rawTrace = formData.get("traceId");
  const trace = typeof rawTrace === "string" && /^[a-z0-9]{12}$/.test(rawTrace) ? rawTrace : "-";

  // ── Is the restaurant taking orders at all? ──
  // The authoritative check. The buttons and the dialog in the browser are a
  // courtesy; this is what makes a closed shop actually closed, including for
  // a stale tab, a resubmitted form or a crafted request.
  const storeStatus = await getStoreStatus();
  if (!storeStatus.isOpen) {
    // After 22:30 the reason is the end of the ordering day, not a closure —
    // the basket the customer kept open is still theirs for tomorrow.
    const code = storeStatus.reason === "daily_cutoff" ? "DAILY_CUTOFF" : "STORE_CLOSED";
    console.info(`[checkout] trace=${trace} refused: ${code}`);
    return { ok: false, error: t(code) };
  }

  // Yesterday's orders must be gone before today's are written (a missed
  // purge would otherwise collide with a re-used checkout key). Cheap: a no-op
  // once this process has purged since the last cutoff.
  await maybePurgeExpiredOrders();

  const sessionUser = await getSessionUser();

  const result = await placeOrder(
    {
      contact: {
        customerName: formData.get("customerName"),
        customerEmail: formData.get("customerEmail"),
        customerPhone: formData.get("customerPhone"),
        deliveryCity: formData.get("deliveryCity"),
        deliveryAddress: formData.get("deliveryAddress"),
        deliveryNote: formData.get("deliveryNote"),
      },
      itemsJson: String(formData.get("items") ?? "[]"),
      paymentMethod: formData.get("paymentMethod") ?? "cash_on_delivery",
      checkoutKey: formData.get("checkoutKey"),
      consents: {
        consentTerms: formData.get("consentTerms"),
        consentRefunds: formData.get("consentRefunds"),
        consentPrivacy: formData.get("consentPrivacy"),
      },
      userId: sessionUser?.id ?? null,
      role: sessionUser?.role ?? null,
    },
    { getProduct: getProductById, getCategory: getCategoryById }
  );

  if (!result.ok) {
    // Codes only — no personal data. Makes a refused checkout traceable in
    // the server log (a refusal used to leave no trace at all).
    console.info(
      `[checkout] trace=${trace} refused:`,
      result.error ?? Object.entries(result.fieldErrors ?? {}).map(([f, c]) => `${f}=${c}`).join(",")
    );
    const fieldErrors = result.fieldErrors
      ? Object.fromEntries(Object.entries(result.fieldErrors).map(([field, code]) => [field, t(code)]))
      : undefined;
    // Only BELOW_MINIMUM uses {amount}/{remaining}; the other messages ignore them.
    const amount = formatEurPrice(DELIVERY_AREA.minimumOrderEur ?? 0);
    const remaining = formatEurPrice(result.shortfallEur ?? 0);
    return {
      ok: false,
      error: result.error ? t(result.error, { amount, remaining }) : undefined,
      fieldErrors,
    };
  }
  console.info(`[checkout] trace=${trace} ok #${result.orderNumber}${result.duplicate ? " (repeat)" : ""}`);
  // This browser may now follow the order: the tracking token goes into an
  // HttpOnly cookie that expires at 22:30 with the order (never localStorage).
  const token = trackingTokenFor(result.orderId);
  if (token) {
    const jar = await cookies();
    jar.set(TRACK_COOKIE, addToTrackCookie(parseTrackCookie(jar.get(TRACK_COOKIE)?.value), token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: nextCutoffAfter(retentionNow()),
    });
  }
  return {
    ok: true,
    orderNumber: result.orderNumber,
    paymentMethod: result.paymentMethod,
    accessToken: result.accessToken,
    receipt: orderReceipt(result.orderNumber) ?? undefined,
  };
}

/**
 * The answer to an attempt whose response never reached the browser: if the
 * order exists, the same result `createOrder` would have returned; otherwise
 * null and the customer may submit again (with the same key — so even then a
 * second order cannot appear).
 */
export async function checkoutAttemptStatus(checkoutKey: unknown): Promise<CheckoutResult | null> {
  const found = await findOrderForCheckoutKey(checkoutKey);
  if (!found || !found.ok) return null;
  return {
    ok: true,
    orderNumber: found.orderNumber,
    paymentMethod: found.paymentMethod,
    accessToken: found.accessToken,
    receipt: orderReceipt(found.orderNumber) ?? undefined,
  };
}
