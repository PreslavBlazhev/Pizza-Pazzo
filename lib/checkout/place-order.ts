/**
 * Placing an order — SERVER ONLY. The body of the checkout server action,
 * kept free of Next.js request APIs so the tests can drive it directly.
 *
 * Security: prices are re-derived on the server from the menu. The client
 * only sends { productId, variantId?, quantity, extras: [{key,
 * sourceProductId, quantity}] }; any price, name, fee, discount or status it
 * might add is rejected by the strict schemas below. `userId` comes from the
 * session, never the form.
 *
 * Payment methods:
 *   cash_on_delivery → released to the kitchen and announced immediately,
 *                      exactly as before card payments existed
 *   card_online      → saved as AWAITING_PAYMENT, invisible to the kitchen,
 *                      no e-mail; the customer continues to /checkout/pay/…
 */
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  checkoutSchema,
  CHECKOUT_FIELD_ERRORS,
  CONSENT_FIELDS,
  isTicked,
  type CheckoutFieldError,
  type CheckoutFormError,
  type ConsentField,
} from "@/lib/validators/checkout";
import { LEGAL_VERSIONS } from "@/content/legal/versions";
import { resolveOrderItemExtras, type ExtraSourceProduct } from "@/lib/extras-resolve";
import { EXTRAS_LIMITS, type OrderItemExtra } from "@/lib/extras-rules";
import { resolveCheckoutPayment } from "@/lib/payments/providers";
import { newAccessToken, releaseToKitchenAndNotify } from "@/lib/payments/service";
import type { Product } from "@/types/product";

/** One chosen extra — identifiers and quantity only, never prices. */
const extraSchema = z.strictObject({
  key: z.string().min(1).max(120),
  sourceProductId: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(EXTRAS_LIMITS.maxSauceQuantity),
});

/** Minimal cart payload the client sends (prices are recomputed server-side). */
export const itemsSchema = z
  .array(
    z.strictObject({
      productId: z.string().min(1).max(120),
      variantId: z.string().min(1).max(120).optional(),
      quantity: z.number().int().min(1).max(99),
      extras: z.array(extraSchema).max(EXTRAS_LIMITS.maxExtrasPerItem).optional(),
    })
  )
  .min(1)
  .max(EXTRAS_LIMITS.maxOrderItems);

/** A checkout attempt's idempotency key: generated once per checkout in the browser. */
export const checkoutKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export type CheckoutPaymentChoice = "cash_on_delivery" | "card_online";

export interface PlaceOrderInput {
  contact: {
    customerName: unknown;
    customerEmail: unknown;
    customerPhone: unknown;
    deliveryCity: unknown;
    deliveryAddress: unknown;
    deliveryNote: unknown;
  };
  /** The raw JSON string of the cart payload. */
  itemsJson: string;
  paymentMethod: unknown;
  checkoutKey: unknown;
  /**
   * The three explicit confirmations, exactly as posted (a ticked checkbox
   * sends "on"). All three are REQUIRED — see CONSENT_FIELDS.
   */
  consents: Partial<Record<ConsentField, unknown>>;
  userId: string | null;
  /** The viewer's role (null = guest): decides whether the card DEMO is offered. */
  role?: string | null;
}

export interface PlaceOrderDeps {
  /** Menu lookup, locale-aware (the action passes lib/menu-data getProductById). */
  getProduct: (id: string, locale: "bg" | "en") => Promise<Product | null | undefined>;
}

export type PlaceOrderResult =
  | {
      ok: true;
      orderNumber: number;
      paymentMethod: "CASH_ON_DELIVERY" | "CARD_ONLINE";
      /** Card orders only: the customer's key to the payment pages. */
      accessToken?: string;
      /** True when this was a repeat of an order already placed. */
      duplicate: boolean;
    }
  | {
      ok: false;
      /** A whole-form refusal — translated by the caller (checkout.errors.<code>). */
      error?: CheckoutFormError;
      /** Per-field refusals, as codes (checkout.errors.<code>). */
      fieldErrors?: Record<string, CheckoutFieldError>;
    };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Orders placed concurrently can race for the next number; retry a few times. */
const ORDER_NUMBER_RETRIES = 5;

function isUniqueViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta?.target ?? "").includes(field)
  );
}

function resultForExisting(order: {
  orderNumber: number;
  paymentMethod: string;
  accessToken: string | null;
}): PlaceOrderResult {
  const card = order.paymentMethod === "CARD_ONLINE";
  return {
    ok: true,
    orderNumber: order.orderNumber,
    paymentMethod: card ? "CARD_ONLINE" : "CASH_ON_DELIVERY",
    ...(card && order.accessToken ? { accessToken: order.accessToken } : {}),
    duplicate: true,
  };
}

export async function placeOrder(
  input: PlaceOrderInput,
  deps: PlaceOrderDeps
): Promise<PlaceOrderResult> {
  // ── 0. Payment method + idempotency key ──
  const method = input.paymentMethod;
  if (method !== "cash_on_delivery" && method !== "card_online") {
    return { ok: false, error: "PAYMENT_METHOD" };
  }
  // The same decision the checkout page made when it showed (or hid) the
  // card option — a crafted request cannot pick a method it was not offered.
  const payment = await resolveCheckoutPayment(input.role ?? null);
  if (method === "card_online" && !payment.available) {
    return { ok: false, error: "CARD_UNAVAILABLE" };
  }

  const keyParsed = checkoutKeySchema.safeParse(input.checkoutKey);
  const checkoutKey = keyParsed.success ? keyParsed.data : null;
  if (checkoutKey) {
    // The same checkout submitted twice (double click, retried request,
    // refresh): hand back the order that already exists.
    const existing = await db.order.findUnique({ where: { checkoutKey } });
    if (existing) return resultForExisting(existing);
  }

  // ── 1. Validate contact + delivery ──
  const parsed = checkoutSchema.safeParse({
    customerName: input.contact.customerName,
    customerEmail: input.contact.customerEmail,
    customerPhone: input.contact.customerPhone,
    deliveryCity: input.contact.deliveryCity,
    deliveryAddress: input.contact.deliveryAddress,
    deliveryNote: input.contact.deliveryNote || undefined,
    paymentMethod: method,
    deliveryMethod: "delivery",
  });

  // ── 1b. The explicit confirmations — checked together with the fields, so
  //    the customer sees every problem at once. Enforced HERE, on the server:
  //    a request that skips the form (or unticks a box in devtools) is refused.
  const fieldErrors: Record<string, CheckoutFieldError> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key !== "string" || fieldErrors[key]) continue;
      fieldErrors[key] = (CHECKOUT_FIELD_ERRORS as readonly string[]).includes(issue.message)
        ? (issue.message as CheckoutFieldError)
        : "FIELD_INVALID";
    }
  }
  for (const field of CONSENT_FIELDS) {
    if (!isTicked(input.consents?.[field])) fieldErrors[field] = "CONSENT_REQUIRED";
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  // ── 2. Validate cart payload ──
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(input.itemsJson || "[]");
  } catch {
    rawItems = null;
  }
  const itemsParsed = itemsSchema.safeParse(rawItems);
  if (!itemsParsed.success) {
    return { ok: false, error: "CART_INVALID" };
  }

  // ── 3. Re-derive prices from the menu (authoritative) ──
  const lineData: {
    productId: string;
    productSlug: string | null;
    productNameBg: string;
    productNameEn: string | null;
    productImageUrl: string | null;
    variantId: string | null;
    variantName: string | null;
    quantity: number;
    unitPriceEur: number;
    totalPriceEur: number;
    extrasJson: string;
  }[] = [];

  let subtotalEur = 0;

  for (const it of itemsParsed.data) {
    const pBg = await deps.getProduct(it.productId, "bg");
    const pEn = await deps.getProduct(it.productId, "en");
    if (!pBg || !pBg.isAvailable) {
      return { ok: false, error: "PRODUCT_UNAVAILABLE" };
    }

    let unitEur = pBg.priceEur;
    let variantId: string | null = null;
    let variantName: string | null = null;
    let mainVariantNameBg: string | undefined;

    if (it.variantId) {
      const vBg = pBg.variants?.find((v) => v.id === it.variantId);
      const vEn = pEn?.variants?.find((v) => v.id === it.variantId);
      if (!vBg) {
        return { ok: false, error: "VARIANT_INVALID" };
      }
      unitEur = vBg.priceEur;
      variantId = it.variantId;
      variantName = vEn ? `${vBg.name} / ${vEn.name}` : vBg.name;
      mainVariantNameBg = vBg.name;
    }

    // ── Extras: resolved and priced ONLY from the database (see
    //    lib/extras-resolve.ts). The client's copy of names/prices is ignored.
    let extras: OrderItemExtra[] = [];
    let extrasUnitEur = 0;

    if (it.extras && it.extras.length > 0) {
      const sourceProducts = new Map<string, ExtraSourceProduct>();
      for (const sourceId of new Set(it.extras.map((e) => e.sourceProductId))) {
        const sBg = await deps.getProduct(sourceId, "bg");
        if (!sBg) continue; // resolver rejects the selection as unknown-product
        const sEn = await deps.getProduct(sourceId, "en");
        sourceProducts.set(sourceId, {
          id: sBg.id,
          categoryId: sBg.categoryId,
          isAvailable: sBg.isAvailable,
          nameBg: sBg.name,
          nameEn: sEn?.name ?? sBg.name,
          priceEur: sBg.priceEur,
          variants: (sBg.variants ?? []).map((v) => ({
            id: v.id,
            nameBg: v.name,
            nameEn: sEn?.variants?.find((x) => x.id === v.id)?.name ?? v.name,
            priceEur: v.priceEur,
          })),
        });
      }

      const resolved = resolveOrderItemExtras({
        mainProduct: { id: pBg.id, categoryId: pBg.categoryId },
        mainVariantName: mainVariantNameBg,
        selections: it.extras,
        sourceProducts,
      });
      if (!resolved.ok) {
        // Deliberately generic for the customer; the code stays server-side.
        return { ok: false, error: "EXTRAS_INVALID" };
      }
      extras = resolved.extras;
      extrasUnitEur = resolved.extrasUnitTotalEur;
    }

    // Line total semantics: the extras set applies to EVERY unit of the line —
    // (base unit + extras per unit) × quantity. unitPriceEur stays the BASE
    // price; the extras' own prices live in the snapshot.
    const perUnitEur = round2(unitEur + extrasUnitEur);
    const lineEur = round2(perUnitEur * it.quantity);
    subtotalEur = round2(subtotalEur + lineEur);

    lineData.push({
      productId: it.productId,
      productSlug: pBg.slug,
      productNameBg: pBg.name,
      productNameEn: pEn?.name ?? null,
      productImageUrl: pBg.imageUrl,
      variantId,
      variantName,
      quantity: it.quantity,
      unitPriceEur: unitEur,
      totalPriceEur: lineEur,
      extrasJson: JSON.stringify(extras),
    });
  }

  // Delivery is free: the items are the whole bill.
  const totalEur = subtotalEur;
  const d = parsed.data;
  const card = method === "card_online";

  // ── 4. Persist Order + OrderItems (orderNumber assigned in the transaction) ──
  for (let attempt = 0; attempt < ORDER_NUMBER_RETRIES; attempt++) {
    try {
      const order = await db.$transaction(async (tx) => {
        const last = await tx.order.findFirst({
          orderBy: { orderNumber: "desc" },
          select: { orderNumber: true },
        });
        const orderNumber = (last?.orderNumber ?? 1000) + 1;
        const now = new Date();

        return tx.order.create({
          data: {
            orderNumber,
            userId: input.userId,
            customerName: d.customerName,
            customerEmail: d.customerEmail,
            customerPhone: d.customerPhone,
            deliveryAddress: d.deliveryAddress,
            deliveryCity: d.deliveryCity,
            deliveryNote: d.deliveryNote ?? null,
            paymentMethod: card ? "CARD_ONLINE" : "CASH_ON_DELIVERY",
            paymentStatus: card ? "AWAITING_PAYMENT" : "CASH_DUE",
            // Cash goes to the kitchen now; card only once the money is confirmed.
            releasedToKitchenAt: card ? null : now,
            // Simulator / sandbox / live-site demo: a test order, never cooked.
            isTest: card ? payment.config.isTest : false,
            accessToken: newAccessToken(),
            checkoutKey,
            deliveryMethod: "DELIVERY",
            status: "PENDING",
            subtotalEur,
            totalEur,
            // Proof of the explicit confirmations: WHICH versions were
            // accepted, and when (server clock). Nothing else is recorded —
            // no IP, no user agent: not needed to prove the contract.
            consentTermsVersion: LEGAL_VERSIONS.terms,
            consentRefundsVersion: LEGAL_VERSIONS.refunds,
            consentPrivacyVersion: LEGAL_VERSIONS.privacy,
            consentRecordedAt: now,
            items: { create: lineData },
          },
        });
      });

      if (!card) {
        // Notify the restaurant — best-effort, never blocks the order, and
        // guarded so a repeat of this request can never send it twice.
        await releaseToKitchenAndNotify(order.id);
      }

      return {
        ok: true,
        orderNumber: order.orderNumber,
        paymentMethod: card ? "CARD_ONLINE" : "CASH_ON_DELIVERY",
        ...(card && order.accessToken ? { accessToken: order.accessToken } : {}),
        duplicate: false,
      };
    } catch (err) {
      if (checkoutKey && isUniqueViolation(err, "checkoutKey")) {
        // The twin request won the race — return what it created.
        const existing = await db.order.findUnique({ where: { checkoutKey } });
        if (existing) return resultForExisting(existing);
      }
      if (isUniqueViolation(err, "orderNumber")) continue;
      console.error("[checkout] could not save order:", (err as Error).message);
      break;
    }
  }
  return { ok: false, error: "SAVE_FAILED" };
}
