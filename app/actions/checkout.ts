"use server";

import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/auth";
import { getProductById } from "@/lib/menu-data";
import { getStoreStatus } from "@/lib/store-status";
import { placeOrder } from "@/lib/checkout/place-order";
import { isLocale } from "@/i18n/routing";

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

  // ── Is the restaurant taking orders at all? ──
  // The authoritative check. The buttons and the dialog in the browser are a
  // courtesy; this is what makes a closed shop actually closed, including for
  // a stale tab, a resubmitted form or a crafted request.
  const storeStatus = await getStoreStatus();
  if (!storeStatus.isOpen) {
    return { ok: false, error: t("STORE_CLOSED") };
  }

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
    { getProduct: getProductById }
  );

  if (!result.ok) {
    const fieldErrors = result.fieldErrors
      ? Object.fromEntries(Object.entries(result.fieldErrors).map(([field, code]) => [field, t(code)]))
      : undefined;
    return { ok: false, error: result.error ? t(result.error) : undefined, fieldErrors };
  }
  return {
    ok: true,
    orderNumber: result.orderNumber,
    paymentMethod: result.paymentMethod,
    accessToken: result.accessToken,
  };
}
