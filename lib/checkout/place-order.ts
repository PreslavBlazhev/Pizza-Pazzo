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
import { isAfterDailyCutoff, orderRetentionEnabled, retentionNow } from "@/lib/order-retention";
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
import { minimumOrderShortfallEur } from "@/lib/delivery-area";
import {
  comboSizeOf,
  pizzaMathDiscount,
  type PizzaComboSnapshot,
  type PizzaMathLine,
} from "@/lib/pizza-math";
import {
  EXTRAS_LIMITS,
  isAddonOnlyCategory,
  isRetiredExtraKey,
  type OrderItemExtra,
} from "@/lib/extras-rules";
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
  /**
   * Category lookup for the snapshot the tickets group by (the action passes
   * lib/menu-data getCategoryById). Optional: without it the lines keep only
   * the category id, and the ticket prints the plain product name.
   */
  getCategory?: (
    id: string,
    locale: "bg" | "en"
  ) => Promise<{ name: string; sortOrder: number } | null | undefined>;
}

/** Thrown inside the order transaction when the clock has passed 22:30. */
class DailyCutoffError extends Error {}

export type PlaceOrderResult =
  | {
      ok: true;
      /** Internal id — the server derives the tracking token from it; never shown. */
      orderId: string;
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
      /** BELOW_MINIMUM only: how much is missing, after the offers. */
      shortfallEur?: number;
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
  id: string;
  orderNumber: number;
  paymentMethod: string;
  accessToken: string | null;
}): PlaceOrderResult {
  const card = order.paymentMethod === "CARD_ONLINE";
  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentMethod: card ? "CARD_ONLINE" : "CASH_ON_DELIVERY",
    ...(card && order.accessToken ? { accessToken: order.accessToken } : {}),
    duplicate: true,
  };
}

/**
 * Did this checkout attempt already create an order? Asked by the checkout
 * page when it reopens with an attempt whose answer never arrived (a lost
 * response, a reload, a navigation mid-request), so the customer is told
 * about the order that exists instead of being invited to place a second one.
 * An unknown or malformed key is simply "no".
 */
export async function findOrderForCheckoutKey(rawKey: unknown): Promise<PlaceOrderResult | null> {
  const parsed = checkoutKeySchema.safeParse(rawKey);
  if (!parsed.success) return null;
  const existing = await db.order.findUnique({ where: { checkoutKey: parsed.data } });
  return existing ? resultForExisting(existing) : null;
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
    discountEur: number;
    categoryId: string;
    categoryNameBg: string | null;
    categoryNameEn: string | null;
    categorySortOrder: number | null;
  }[] = [];
  const categoryCache = new Map<string, { bg: string | null; en: string | null; sort: number | null }>();

  let subtotalEur = 0;
  const pizzaMathLines: PizzaMathLine[] = [];

  for (const it of itemsParsed.data) {
    const pBg = await deps.getProduct(it.productId, "bg");
    const pEn = await deps.getProduct(it.productId, "en");
    if (!pBg || !pBg.isAvailable) {
      return { ok: false, error: "PRODUCT_UNAVAILABLE" };
    }
    // Toppings and burger add-ons exist only ON a pizza or a burger: a line
    // of their own (an old basket, a crafted request) is refused.
    if (isAddonOnlyCategory(pBg.categoryId)) {
      return { ok: false, error: "ADDON_STANDALONE" };
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
      // "Месна добавка" and the other generic options of an old basket: the
      // customer must choose the ingredient again — never guessed here.
      if (it.extras.some((e) => isRetiredExtraKey(e.key))) {
        return { ok: false, error: "EXTRAS_OUTDATED" };
      }
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
    // Whole cents throughout — no floating-point drift on long topping lists.
    const perUnitCents = Math.round(unitEur * 100) + Math.round(extrasUnitEur * 100);
    const lineEur = (perUnitCents * it.quantity) / 100;
    subtotalEur = (Math.round(subtotalEur * 100) + perUnitCents * it.quantity) / 100;

    pizzaMathLines.push({
      key: `L${lineData.length}`,
      categoryId: pBg.categoryId,
      variantName: mainVariantNameBg ?? null,
      baseUnitEur: unitEur,
      quantity: it.quantity,
    });

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
      discountEur: 0,
      categoryId: pBg.categoryId,
      ...(await (async () => {
        let c = categoryCache.get(pBg.categoryId);
        if (!c) {
          const cBg = deps.getCategory ? await deps.getCategory(pBg.categoryId, "bg") : null;
          const cEn = deps.getCategory ? await deps.getCategory(pBg.categoryId, "en") : null;
          c = { bg: cBg?.name ?? null, en: cEn?.name ?? null, sort: cBg?.sortOrder ?? null };
          categoryCache.set(pBg.categoryId, c);
        }
        return { categoryNameBg: c.bg, categoryNameEn: c.en, categorySortOrder: c.sort };
      })()),
    });
  }

  // ── 3b. „Грешна математика“ — the two-pizza combos, priced from the
  //    SERVER's own menu rows and categories (lib/pizza-math.ts; the basket
  //    previews the same function). They replace only the base prices of the
  //    paired pizzas; extras stay on top. This is the order's ONLY discount,
  //    so nothing can be discounted twice.
  const offer = pizzaMathDiscount(pizzaMathLines);
  const discountEur = offer.discountEur;
  lineData.forEach((line, i) => {
    line.discountEur = offer.lineDiscountsEur[`L${i}`] ?? 0;
  });
  const pizzaLabel = (key: string) => {
    const line = lineData[Number(key.slice(1))];
    const size = line ? comboSizeOf({ categoryId: line.categoryId, variantName: line.variantName }) : null;
    return line ? `${line.productNameBg}${size ? ` ${size} см` : ""}` : "";
  };
  const offerSnapshot: PizzaComboSnapshot[] = offer.pairs.map((p) => ({
    sizes: p.sizes,
    comboEur: p.comboEur,
    regularEur: p.regularEur,
    discountEur: p.discountEur,
    pizzasBg: [pizzaLabel(p.lineKeys[0]), pizzaLabel(p.lineKeys[1])],
  }));
  // Delivery is free: the items after the discount are the whole bill.
  const totalEur = round2(subtotalEur - discountEur);

  // ── 3c. Minimum order for delivery — on the server-priced total AFTER the
  //    discount, so a tampered cart cannot slip under it. No delivery fee
  //    counts towards it. Every site order is a delivery.
  const shortfallEur = minimumOrderShortfallEur(totalEur);
  if (shortfallEur > 0) {
    return { ok: false, error: "BELOW_MINIMUM", shortfallEur };
  }
  const d = parsed.data;
  const card = method === "card_online";

  // ── 4. Persist Order + OrderItems (orderNumber assigned in the transaction) ──
  for (let attempt = 0; attempt < ORDER_NUMBER_RETRIES; attempt++) {
    try {
      const order = await db.$transaction(async (tx) => {
        // Dormant design only (retention ON): the cutoff is checked HERE, on
        // the clock of the write itself. While the retention is off (the
        // history is kept) there is no 22:30 ban — the opening hours, checked
        // in app/actions/checkout.ts, alone decide.
        const now = retentionNow();
        if (orderRetentionEnabled() && isAfterDailyCutoff(now)) throw new DailyCutoffError();

        // Numbers keep counting across days (OrderSequence, prisma/schema):
        // no order ever gets the number of another (kept or, if the dormant
        // retention were ever on, deleted).
        // (Through `tx`: the pool has ONE connection — lib/db.ts — and this
        // transaction holds it.)
        const seq = await tx.orderSequence.upsert({
          where: { id: "order" },
          create: { id: "order", lastNumber: 1001 },
          update: { lastNumber: { increment: 1 } },
        });
        // A table emptied by hand would leave the counter behind the real
        // numbers; the max of both keeps the unique index safe either way.
        const last = await tx.order.findFirst({
          orderBy: { orderNumber: "desc" },
          select: { orderNumber: true },
        });
        const orderNumber = Math.max(seq.lastNumber, (last?.orderNumber ?? 1000) + 1);
        if (orderNumber !== seq.lastNumber) {
          await tx.orderSequence.update({ where: { id: "order" }, data: { lastNumber: orderNumber } });
        }

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
            discountEur,
            totalEur,
            offerJson: JSON.stringify(offerSnapshot),
            createdAt: now,
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
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: card ? "CARD_ONLINE" : "CASH_ON_DELIVERY",
        ...(card && order.accessToken ? { accessToken: order.accessToken } : {}),
        duplicate: false,
      };
    } catch (err) {
      if (err instanceof DailyCutoffError) return { ok: false, error: "DAILY_CUTOFF" };
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
