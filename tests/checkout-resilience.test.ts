/**
 * The checkout's answers when the browser's view of an order is uncertain —
 * a lost reply, a reload mid-request, a repeated click — proven on the server
 * code. The browser half (the page after a 500, a dropped connection, a lost
 * reply, a language switch) is scripts/e2e-checkout-language.ts.
 *
 *   - the same checkout key never makes a second order, sequential or racing
 *   - findOrderForCheckoutKey finds exactly the order a key made, and nothing
 *     for an unknown or malformed key
 *   - the order-success receipt verifies only for its own order number
 *
 * Runs on a brand-new temp SQLite (tests/setup-env.mjs).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { findOrderForCheckoutKey, placeOrder, type PlaceOrderInput } from "@/lib/checkout/place-order";
import { isValidOrderReceipt, orderReceipt } from "@/lib/checkout/receipt";
import type { Product } from "@/types/product";
import { ALL_CONSENTS, CONTACT, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

const PIZZA: Product = {
  id: "prod_pizza",
  name: "Пица",
  slug: "pizza",
  description: "",
  categoryId: "cat_pizzas_standard",
  priceEur: 9.71,
  imageUrl: "/x.svg",
  allergens: [],
  isAvailable: true,
  sortOrder: 0,
  variants: [{ id: "var_pizza_30", name: "30 см", priceEur: 9.71 }],
};
const deps = { getProduct: async (id: string) => (id === PIZZA.id ? PIZZA : null) };

function input(checkoutKey: string): PlaceOrderInput {
  return {
    contact: CONTACT,
    itemsJson: JSON.stringify([{ productId: PIZZA.id, variantId: "var_pizza_30", quantity: 2 }]),
    paymentMethod: "cash_on_delivery",
    checkoutKey,
    userId: null,
    consents: ALL_CONSENTS,
  };
}

const ordersWithKey = (k: string) => db.order.count({ where: { checkoutKey: k } });

test("a lost reply, then a retry with the same key: one order, the same number", async () => {
  const k = key();
  const first = await placeOrder(input(k), deps);
  assert.ok(first.ok);
  const retry = await placeOrder(input(k), deps);
  assert.ok(retry.ok);
  assert.equal(retry.orderNumber, first.orderNumber);
  assert.equal(retry.duplicate, true);
  assert.equal(await ordersWithKey(k), 1);
});

test("three simultaneous submits with one key: one order", async () => {
  const k = key();
  const results = await Promise.all([1, 2, 3].map(() => placeOrder(input(k), deps)));
  assert.ok(results.every((r) => r.ok));
  const numbers = new Set(results.map((r) => (r.ok ? r.orderNumber : 0)));
  assert.equal(numbers.size, 1);
  assert.equal(await ordersWithKey(k), 1);
});

test("findOrderForCheckoutKey: nothing before, the order after, nothing for junk", async () => {
  const k = key();
  assert.equal(await findOrderForCheckoutKey(k), null);
  const placed = await placeOrder(input(k), deps);
  assert.ok(placed.ok);
  const found = await findOrderForCheckoutKey(k);
  assert.ok(found?.ok);
  assert.equal(found.orderNumber, placed.orderNumber);
  assert.equal(found.paymentMethod, "CASH_ON_DELIVERY");
  assert.equal(found.accessToken, undefined, "a cash order still exposes no payment token");
  for (const junk of [undefined, null, "", "short", "x".repeat(65), "bad key with spaces!!", 42]) {
    assert.equal(await findOrderForCheckoutKey(junk), null, `junk key ${String(junk)}`);
  }
});

test("a refused attempt leaves the key unused, so the corrected retry creates the order", async () => {
  const k = key();
  const refused = await placeOrder({ ...input(k), consents: { ...ALL_CONSENTS, consentTerms: null } }, deps);
  assert.equal(refused.ok, false);
  assert.equal(await findOrderForCheckoutKey(k), null);
  const ok = await placeOrder(input(k), deps);
  assert.ok(ok.ok);
  assert.equal(await ordersWithKey(k), 1);
});

test("order receipt: valid only for its own number, refused when forged", () => {
  const r = orderReceipt(1234);
  assert.ok(r && r.length === 32);
  assert.equal(isValidOrderReceipt(1234, r), true);
  assert.equal(isValidOrderReceipt(1235, r), false);
  assert.equal(isValidOrderReceipt(1234, "x".repeat(32)), false);
  assert.equal(isValidOrderReceipt(1234, undefined), false);
  assert.equal(isValidOrderReceipt(1234, r!.slice(0, 31)), false);
});

test("order receipt: without AUTH_SECRET nothing is signed and nothing verifies", () => {
  const saved = process.env.AUTH_SECRET;
  try {
    const r = orderReceipt(77);
    delete process.env.AUTH_SECRET;
    assert.equal(orderReceipt(77), null);
    assert.equal(isValidOrderReceipt(77, r), false);
  } finally {
    process.env.AUTH_SECRET = saved;
  }
});
