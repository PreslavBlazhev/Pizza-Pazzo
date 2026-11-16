/**
 * Android-app analytics (lib/app-analytics.ts): what the site hands the app
 * for GA4. The rules that matter:
 *
 *   - a purchase is reported only for a real, accepted sale — never for a
 *     test order, a cancelled order, or a card order the bank has not
 *     confirmed (or that is held for staff);
 *   - amounts come from the saved order, in EUR, and the order number is the
 *     transaction id;
 *   - nothing personal (name, e-mail, phone, address, note) is in any payload;
 *   - outside the app every call is a no-op.
 *
 * Pure — no database needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addToCartParams,
  beginCheckoutParams,
  purchaseParams,
  trackAppEvent,
  trackAppPurchase,
  viewItemParams,
} from "@/lib/app-analytics";
import type { Order } from "@/types/order";
import type { Product } from "@/types/product";
import type { CartItem } from "@/types/cart";

const PERSONAL = ["Иван Петров", "ivan@example.com", "0888123456", "ул. Тест 1", "звънец 3"];

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    orderNumber: 1042,
    userId: null,
    customerName: "Иван Петров",
    customerEmail: "ivan@example.com",
    customerPhone: "0888123456",
    deliveryAddress: "ул. Тест 1",
    deliveryCity: "Плевен",
    deliveryNote: "звънец 3",
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "CASH_DUE",
    paidAt: null,
    releasedToKitchenAt: "2026-10-14T10:00:00.000Z",
    isTest: false,
    paymentAlert: null,
    paymentAlertAckAt: null,
    paymentAlertAckBy: null,
    notificationStatus: null,
    notificationAttempts: 0,
    notificationError: null,
    deliveryMethod: "DELIVERY",
    status: "PENDING",
    subtotalEur: 21.5,
    discountEur: 0,
    totalEur: 21.5,
    estimatedTimeMinutes: null,
    adminNote: null,
    acceptedAt: null,
    cancelledAt: null,
    completedAt: null,
    anonymizedAt: null,
    consent: { termsVersion: null, refundsVersion: null, privacyVersion: null, recordedAt: null },
    createdAt: "2026-10-14T10:00:00.000Z",
    updatedAt: "2026-10-14T10:00:00.000Z",
    items: [
      {
        id: "i1",
        orderId: "o1",
        productId: "prod_margarita",
        productSlug: "margarita",
        productNameBg: "Маргарита",
        productNameEn: "Margherita",
        productImageUrl: null,
        variantId: "var_margarita_1",
        variantName: "30 см",
        quantity: 2,
        unitPriceEur: 9,
        totalPriceEur: 19,
        extras: [],
        itemNote: "без лук, звънец 3",
      },
      {
        id: "i2",
        orderId: "o1",
        productId: "prod_cola",
        productSlug: "cola",
        productNameBg: "Кока-Кола",
        productNameEn: "Coca-Cola",
        productImageUrl: null,
        variantId: null,
        variantName: null,
        quantity: 1,
        unitPriceEur: 2.5,
        totalPriceEur: 2.5,
        extras: [],
        itemNote: null,
      },
    ],
    ...overrides,
  } as Order;
}

test("cash order placed: one purchase with server amounts in EUR", () => {
  const p = purchaseParams(order())!;
  assert.equal(p.transaction_id, "1042");
  assert.equal(p.currency, "EUR");
  assert.equal(p.value, 21.5);
  assert.equal(p.shipping, 0);
  assert.deepEqual(p.items, [
    { item_id: "prod_margarita", item_name: "Маргарита", item_variant: "30 см", price: 9.5, quantity: 2 },
    { item_id: "prod_cola", item_name: "Кока-Кола", price: 2.5, quantity: 1 },
  ]);
});

test("paid card order that reached the kitchen is a purchase", () => {
  const p = purchaseParams(order({ paymentMethod: "CARD_ONLINE", paymentStatus: "PAID" }));
  assert.equal(p?.transaction_id, "1042");
});

test("never a purchase: unpaid / failed card, held, cancelled, test, empty", () => {
  for (const paymentStatus of ["AWAITING_PAYMENT", "FAILED", "CANCELLED", "EXPIRED"] as const) {
    assert.equal(purchaseParams(order({ paymentMethod: "CARD_ONLINE", paymentStatus })), null, paymentStatus);
  }
  assert.equal(
    purchaseParams(order({ paymentMethod: "CARD_ONLINE", paymentStatus: "PAID", releasedToKitchenAt: null })),
    null,
    "paid late, held for staff"
  );
  assert.equal(purchaseParams(order({ status: "CANCELLED" })), null);
  assert.equal(purchaseParams(order({ isTest: true })), null);
  assert.equal(purchaseParams(order({ items: [] })), null);
});

test("no personal data in the purchase payload", () => {
  const json = JSON.stringify(purchaseParams(order()));
  for (const value of PERSONAL) assert.ok(!json.includes(value), value);
});

const product: Product = {
  id: "prod_margarita",
  name: "Margherita",
  names: { bg: "Маргарита", en: "Margherita" },
  slug: "margarita",
  description: "",
  categoryId: "cat_pizzas_standard",
  priceEur: 9,
  imageUrl: "",
  allergens: [],
  isAvailable: true,
  sortOrder: 1,
  variants: [
    { id: "var_margarita_1", name: "30 cm", names: { bg: "30 см", en: "30 cm" }, priceEur: 9 },
    { id: "var_margarita_2", name: "40 cm", names: { bg: "40 см", en: "40 cm" }, priceEur: 13 },
  ],
};

test("view_item: Bulgarian names whatever the page language, default size", () => {
  assert.deepEqual(viewItemParams(product, product.variants![0]), {
    currency: "EUR",
    value: 9,
    items: [
      {
        item_id: "prod_margarita",
        item_name: "Маргарита",
        item_variant: "30 см",
        item_category: "cat_pizzas_standard",
        price: 9,
        quantity: 1,
      },
    ],
  });
});

test("add_to_cart and begin_checkout count extras in the unit price", () => {
  const line: CartItem = {
    lineId: "l1",
    product,
    selectedVariant: product.variants![1],
    extras: [
      {
        key: "addon:x",
        sourceProductId: "prod_x",
        quantity: 1,
        display: { nameBg: "Бекон", nameEn: "Bacon", unitPriceEur: 1.5 },
      },
    ],
    quantity: 2,
    unitPrice: 13,
    note: "звънец 3",
  };
  const add = addToCartParams(line);
  assert.equal(add.value, 29);
  assert.equal(add.items[0].price, 14.5);
  assert.equal(add.items[0].quantity, 2);
  assert.ok(!JSON.stringify(add).includes("звънец"));

  const checkout = beginCheckoutParams([line])!;
  assert.equal(checkout.currency, "EUR");
  assert.equal(checkout.items.length, 1);
  assert.equal(beginCheckoutParams([]), null);
});

test("outside the Android app nothing is sent", () => {
  assert.equal(trackAppEvent("login", { method: "password" }), false);
  assert.equal(trackAppPurchase(purchaseParams(order())!), false);
});
