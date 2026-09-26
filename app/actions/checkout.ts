"use server";

import { getSessionUser } from "@/lib/auth";
import { getProductById } from "@/lib/menu-data";
import { getStoreStatus } from "@/lib/store-status";
import { placeOrder } from "@/lib/checkout/place-order";

/**
 * Checkout — the server action behind the checkout form.
 *
 * Only the request-bound parts live here (open/closed check, session); the
 * order itself is built by lib/checkout/place-order.ts, which re-derives every
 * price on the server and handles both payment methods and idempotency.
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
  // ── Is the restaurant taking orders at all? ──
  // The authoritative check. The buttons and the dialog in the browser are a
  // courtesy; this is what makes a closed shop actually closed, including for
  // a stale tab, a resubmitted form or a crafted request.
  const storeStatus = await getStoreStatus();
  if (!storeStatus.isOpen) {
    return {
      ok: false,
      error:
        "Заведението в момента е затворено и не приема поръчки. Опитайте отново, когато отворим.",
    };
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
      userId: sessionUser?.id ?? null,
      role: sessionUser?.role ?? null,
    },
    { getProduct: getProductById }
  );

  if (!result.ok) {
    return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
  }
  return {
    ok: true,
    orderNumber: result.orderNumber,
    paymentMethod: result.paymentMethod,
    accessToken: result.accessToken,
  };
}
