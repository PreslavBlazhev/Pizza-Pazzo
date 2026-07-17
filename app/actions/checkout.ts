"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getProductById } from "@/lib/menu-data";
import { checkoutSchema } from "@/lib/validators/checkout";
import { DELIVERY_FEE, EUR_TO_BGN } from "@/lib/constants";
import { sendNewOrderNotification } from "@/lib/email/resend";

/**
 * Checkout — creates an Order + OrderItems in SQLite.
 *
 * Security: prices are re-derived ON THE SERVER from the menu data. The client
 * only sends { productId, variantId?, quantity }; whatever price it might claim
 * is ignored. `userId` comes from the session, never the form.
 */

/** Minimal cart payload the client sends (prices are recomputed server-side). */
const itemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1),
      variantId: z.string().min(1).optional(),
      quantity: z.number().int().min(1).max(99),
    })
  )
  .min(1);

export interface CheckoutResult {
  ok: boolean;
  orderNumber?: number;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function createOrder(
  _prev: CheckoutResult | null,
  formData: FormData
): Promise<CheckoutResult> {
  // ── 1. Validate contact + delivery ──
  const parsed = checkoutSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    deliveryCity: formData.get("deliveryCity") || undefined,
    deliveryAddress: formData.get("deliveryAddress"),
    deliveryNote: formData.get("deliveryNote") || undefined,
    paymentMethod: "cash_on_delivery",
    deliveryMethod: "delivery",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  // ── 2. Validate cart payload ──
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    rawItems = null;
  }
  const itemsParsed = itemsSchema.safeParse(rawItems);
  if (!itemsParsed.success) {
    return { ok: false, error: "Количката е празна или невалидна." };
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
    unitPriceBgn: number;
    unitPriceEur: number;
    totalPriceBgn: number;
    totalPriceEur: number;
  }[] = [];

  let subtotalBgn = 0;
  let subtotalEur = 0;

  for (const it of itemsParsed.data) {
    const pBg = getProductById(it.productId, "bg");
    const pEn = getProductById(it.productId, "en");
    if (!pBg || !pBg.isAvailable) {
      return { ok: false, error: "Един от продуктите вече не е наличен. Обновете количката." };
    }

    let unitBgn = pBg.priceBgn;
    let unitEur = pBg.priceEur;
    let variantId: string | null = null;
    let variantName: string | null = null;

    if (it.variantId) {
      const vBg = pBg.variants?.find((v) => v.id === it.variantId);
      const vEn = pEn?.variants?.find((v) => v.id === it.variantId);
      if (!vBg) {
        return { ok: false, error: "Невалиден размер на продукт. Обновете количката." };
      }
      unitBgn = vBg.priceBgn;
      unitEur = vBg.priceEur;
      variantId = it.variantId;
      variantName = vEn ? `${vBg.name} / ${vEn.name}` : vBg.name;
    }

    const lineBgn = round2(unitBgn * it.quantity);
    const lineEur = round2(unitEur * it.quantity);
    subtotalBgn = round2(subtotalBgn + lineBgn);
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
      unitPriceBgn: unitBgn,
      unitPriceEur: unitEur,
      totalPriceBgn: lineBgn,
      totalPriceEur: lineEur,
    });
  }

  const deliveryFeeEur = DELIVERY_FEE;
  const deliveryFeeBgn = round2(DELIVERY_FEE * EUR_TO_BGN);
  const totalBgn = round2(subtotalBgn + deliveryFeeBgn);
  const totalEur = round2(subtotalEur + deliveryFeeEur);

  const sessionUser = await getSessionUser();
  const d = parsed.data;

  // ── 4. Persist Order + OrderItems (orderNumber assigned in the transaction) ──
  try {
    const order = await db.$transaction(async (tx) => {
      const last = await tx.order.findFirst({
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      });
      const orderNumber = (last?.orderNumber ?? 1000) + 1;

      return tx.order.create({
        data: {
          orderNumber,
          userId: sessionUser?.id ?? null,
          customerName: d.customerName,
          customerEmail: d.customerEmail,
          customerPhone: d.customerPhone,
          deliveryAddress: d.deliveryAddress,
          deliveryCity: d.deliveryCity,
          deliveryNote: d.deliveryNote ?? null,
          paymentMethod: "CASH_ON_DELIVERY",
          deliveryMethod: "DELIVERY",
          status: "PENDING",
          subtotalBgn,
          subtotalEur,
          deliveryFeeBgn,
          deliveryFeeEur,
          totalBgn,
          totalEur,
          items: { create: lineData },
        },
      });
    });

    // Notify the restaurant inbox — best-effort, never blocks the order.
    await sendNewOrderNotification({
      orderNumber: order.orderNumber,
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      customerEmail: d.customerEmail,
      deliveryCity: d.deliveryCity,
      deliveryAddress: d.deliveryAddress,
      deliveryNote: d.deliveryNote ?? null,
      totalBgn,
      totalEur,
      items: lineData.map((i) => ({
        nameBg: i.productNameBg,
        variantName: i.variantName,
        quantity: i.quantity,
        totalPriceBgn: i.totalPriceBgn,
      })),
    });

    return { ok: true, orderNumber: order.orderNumber };
  } catch {
    return { ok: false, error: "Поръчката не можа да бъде записана. Опитайте отново." };
  }
}
