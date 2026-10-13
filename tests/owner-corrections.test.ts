/**
 * The owner's corrections of 2026-10-12, proven on the server code itself:
 *
 *   - minimum order for delivery: 10 € — 9.99 refused, 10.00 and 10.01 pass,
 *     checked on the SERVER's prices (a tampered basket cannot slip under)
 *   - "Моята Пацо": 0–3 free toppings that never change the price; a 4th is
 *     refused (not turned into a paid one); free toppings on any other pizza
 *     are refused; paid toppings are charged exactly once per pizza
 *   - the maths: (base + extras per unit) × quantity, identical in the
 *     basket preview and in the saved order
 *   - basket editing: a line edited in place keeps its position, merges with
 *     an identical line, and quantities stay within 1–99
 *   - the phone link: 064 801 999 → tel:+35964801999
 *
 * Runs on a brand-new temp SQLite built by the real migrations
 * (tests/setup-env.mjs); nothing touches prisma/dev.db or Render.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { placeOrder, type PlaceOrderInput } from "@/lib/checkout/place-order";
import { DELIVERY_AREA, minimumOrderShortfallEur } from "@/lib/delivery-area";
import { resolveOrderItemExtras, type ExtraSourceProduct } from "@/lib/extras-resolve";
import {
  FREE_TOPPINGS_BY_PRODUCT,
  freeToppingsLimitFor,
  parseOrderItemExtras,
  type ExtraSelection,
} from "@/lib/extras-rules";
import { telHref } from "@/lib/working-hours";
import { linePreviewTotalEur, lineUnitPreviewEur, useCartStore } from "@/store/cart-store";
import type { CartExtraSelection, CartItem } from "@/types/cart";
import type { Product } from "@/types/product";
import { ALL_CONSENTS, CONTACT, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

// ── A small menu with the REAL ids and prices the rules are keyed on ─────────

const sized = (id: string, p30: number, p40: number) => [
  { id: `${id}_30`, name: "30 см", priceEur: p30 },
  { id: `${id}_40`, name: "40 см", priceEur: p40 },
];

const product = (p: Partial<Product> & Pick<Product, "id" | "categoryId" | "priceEur">): Product => ({
  name: p.id,
  slug: p.id,
  description: "",
  imageUrl: "/x.svg",
  allergens: [],
  isAvailable: true,
  sortOrder: 0,
  ...p,
});

const MENU: Record<string, Product> = {
  prod_moyata_patso: product({
    id: "prod_moyata_patso",
    categoryId: "cat_pizzas_standard",
    priceEur: 9.71,
    variants: sized("var_moyata", 9.71, 12.78),
  }),
  prod_margarita: product({
    id: "prod_margarita",
    categoryId: "cat_pizzas_standard",
    priceEur: 9.71,
    variants: sized("var_margarita", 9.71, 12.78),
  }),
  // Four of the owner's concrete toppings (2026-10-13), with his prices.
  prod_topping_bekon: product({
    id: "prod_topping_bekon",
    categoryId: "cat_pizza_addons",
    priceEur: 2.56,
    variants: sized("var_topping_bekon", 2.56, 3.07),
  }),
  prod_topping_kashkaval: product({
    id: "prod_topping_kashkaval",
    categoryId: "cat_pizza_addons",
    priceEur: 2.56,
    variants: sized("var_topping_kashkaval", 2.56, 3.07),
  }),
  prod_topping_riba_ton: product({
    id: "prod_topping_riba_ton",
    categoryId: "cat_pizza_addons",
    priceEur: 2.56,
    variants: sized("var_topping_riba_ton", 2.56, 3.07),
  }),
  prod_topping_gabi: product({
    id: "prod_topping_gabi",
    categoryId: "cat_pizza_addons",
    priceEur: 2.05,
    variants: sized("var_topping_gabi", 2.05, 2.56),
  }),
  prod_sauce: product({ id: "prod_sauce", categoryId: "cat_sauces", priceEur: 1.02 }),
  prod_999: product({ id: "prod_999", categoryId: "cat_drinks", priceEur: 9.99 }),
  prod_1000: product({ id: "prod_1000", categoryId: "cat_drinks", priceEur: 10 }),
  prod_1001: product({ id: "prod_1001", categoryId: "cat_drinks", priceEur: 10.01 }),
  prod_333: product({ id: "prod_333", categoryId: "cat_drinks", priceEur: 3.33 }),
};

const deps = { getProduct: async (id: string) => MENU[id] ?? null };

function input(items: unknown[]): PlaceOrderInput {
  return {
    contact: CONTACT,
    itemsJson: JSON.stringify(items),
    paymentMethod: "cash_on_delivery",
    checkoutKey: key(),
    userId: null,
    consents: ALL_CONSENTS,
  };
}

// Free picks are concrete ingredients too (bacon, kashkaval, tuna, mushrooms).
const MEAT = { key: "free_topping:prod_topping_bekon", sourceProductId: "prod_topping_bekon", quantity: 1 };
const DAIRY = { key: "free_topping:prod_topping_kashkaval", sourceProductId: "prod_topping_kashkaval", quantity: 1 };
const FISH = { key: "free_topping:prod_topping_riba_ton", sourceProductId: "prod_topping_riba_ton", quantity: 1 };
const VEG = { key: "free_topping:prod_topping_gabi", sourceProductId: "prod_topping_gabi", quantity: 1 };
const PAID_MEAT = { key: "pizza_topping:prod_topping_bekon", sourceProductId: "prod_topping_bekon", quantity: 1 };

/** The resolver's view of the menu (what place-order builds from the DB). */
const sources = new Map<string, ExtraSourceProduct>(
  Object.values(MENU).map((p) => [
    p.id,
    {
      id: p.id,
      categoryId: p.categoryId,
      isAvailable: p.isAvailable,
      nameBg: p.name,
      nameEn: p.name,
      priceEur: p.priceEur,
      variants: (p.variants ?? []).map((v) => ({ ...v, nameBg: v.name, nameEn: v.name })),
    },
  ])
);

const resolve = (productId: string, selections: ExtraSelection[], size = "30 см") =>
  resolveOrderItemExtras({
    mainProduct: { id: productId, categoryId: MENU[productId].categoryId },
    mainVariantName: size,
    selections,
    sourceProducts: sources,
  });

// ── Minimum order for delivery ─────────────────────────────────────────────

test("minimum: the configured minimum is 10 €", () => {
  assert.equal(DELIVERY_AREA.minimumOrderEur, 10);
});

test("minimum: shortfall in whole cents — 9.99 short by 0.01, 10.00 and 10.01 pass", () => {
  assert.equal(minimumOrderShortfallEur(9.99), 0.01);
  assert.equal(minimumOrderShortfallEur(10), 0);
  assert.equal(minimumOrderShortfallEur(10.01), 0);
  assert.equal(minimumOrderShortfallEur(0), 10);
  assert.equal(minimumOrderShortfallEur(7.5), 2.5);
  // 3 × 3.33 is 9.989999… in floating point — still exactly 0.01 short.
  assert.equal(minimumOrderShortfallEur(3.33 * 3), 0.01);
});

test("minimum: the server refuses 9.99 € and saves nothing", async () => {
  const before = await db.order.count();
  const r = await placeOrder(input([{ productId: "prod_999", quantity: 1 }]), deps);
  assert.deepEqual(r, { ok: false, error: "BELOW_MINIMUM", shortfallEur: 0.01 });
  assert.equal(await db.order.count(), before);
});

test("minimum: the server refuses 3 × 3.33 = 9.99 € (floating point cannot sneak under)", async () => {
  const r = await placeOrder(input([{ productId: "prod_333", quantity: 3 }]), deps);
  assert.deepEqual(r, { ok: false, error: "BELOW_MINIMUM", shortfallEur: 0.01 });
});

for (const [id, expected] of [["prod_1000", 10], ["prod_1001", 10.01]] as const) {
  test(`minimum: the server accepts ${expected.toFixed(2)} € and stores exactly that total`, async () => {
    const r = await placeOrder(input([{ productId: id, quantity: 1 }]), deps);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const row = await db.order.findUnique({ where: { orderNumber: r.orderNumber } });
    assert.equal(Number(row?.subtotalEur), expected);
    assert.equal(Number(row?.totalEur), expected);
  });
}

test("minimum: a client-sent price cannot lift a 9.99 € basket over the minimum", async () => {
  const r = await placeOrder(input([{ productId: "prod_999", quantity: 1, priceEur: 20 }]), deps);
  assert.equal(r.ok, false);
});

// ── "Моята Пацо": free toppings ────────────────────────────────────────────

test("free toppings: only «Моята Пацо» has them, and it has exactly 3", () => {
  assert.deepEqual(FREE_TOPPINGS_BY_PRODUCT, { prod_moyata_patso: 3 });
  assert.equal(freeToppingsLimitFor("prod_moyata_patso"), 3);
  assert.equal(freeToppingsLimitFor("prod_margarita"), 0);
});

for (const picks of [[], [MEAT], [MEAT, DAIRY], [MEAT, DAIRY, VEG]]) {
  test(`free toppings: ${picks.length} chosen — accepted, price unchanged`, () => {
    const r = resolve("prod_moyata_patso", picks);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.extras.length, picks.length);
    assert.equal(r.extrasUnitTotalEur, 0);
    for (const e of r.extras) {
      assert.equal(e.type, "pizza_free_topping");
      assert.equal(e.unitPriceEur, 0);
      assert.equal(e.totalPriceEur, 0);
    }
  });
}

test("free toppings: a 4th is refused — not quietly charged", () => {
  const r = resolve("prod_moyata_patso", [MEAT, DAIRY, FISH, VEG]);
  assert.deepEqual(r, { ok: false, code: "too-many-free-toppings" });
});

test("free toppings: the same kind twice is refused", () => {
  const r = resolve("prod_moyata_patso", [MEAT, MEAT]);
  assert.deepEqual(r, { ok: false, code: "duplicate-selection" });
});

test("free toppings: refused on every other pizza", () => {
  const r = resolve("prod_margarita", [MEAT]);
  assert.deepEqual(r, { ok: false, code: "not-allowed-for-product" });
});

test("free toppings: a key pointing at the wrong source product is refused", () => {
  const r = resolve("prod_moyata_patso", [{ ...VEG, sourceProductId: "prod_topping_bekon" }]);
  assert.deepEqual(r, { ok: false, code: "key-product-mismatch" });
});

test("free + paid: 3 free and a paid meat topping — only the paid one costs, once", () => {
  const r = resolve("prod_moyata_patso", [MEAT, DAIRY, VEG, PAID_MEAT]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.extrasUnitTotalEur, 2.56);
  // 40 cm: the paid topping follows the size, the free ones stay free.
  const r40 = resolve("prod_moyata_patso", [MEAT, PAID_MEAT], "40 см");
  assert.equal(r40.ok && r40.extrasUnitTotalEur, 3.07);
});

// ── The maths, end to end: basket preview = saved order ────────────────────

/** A basket line exactly as the product page builds it (display = preview). */
function cartLine(
  productId: string,
  variantIndex: 0 | 1,
  quantity: number,
  extras: { sel: typeof MEAT; price: number }[]
): CartItem {
  const p = MENU[productId];
  const v = p.variants?.[variantIndex];
  const list: CartExtraSelection[] = extras.map(({ sel, price }) => ({
    ...sel,
    display: { nameBg: sel.key, nameEn: sel.key, unitPriceEur: price },
  }));
  return {
    lineId: `${productId}::${v?.id}`,
    product: p,
    selectedVariant: v,
    extras: list,
    quantity,
    unitPrice: v?.priceEur ?? p.priceEur,
  };
}

const payload = (lines: CartItem[]) =>
  lines.map((i) => ({
    productId: i.product.id,
    variantId: i.selectedVariant?.id,
    quantity: i.quantity,
    extras: i.extras.map(({ key: k, sourceProductId, quantity }) => ({ key: k, sourceProductId, quantity })),
  }));

// Two pizzas are also the „Грешна математика“ pair (30 + 30 → 16.87 €): the
// two bases 19.42 € become 16.87 € (−2.55 €); the paid topping stays on top.
// tests/pizza-math.test.ts covers the offer itself.
test("maths: 2 × «Моята Пацо» 30 cm with 3 free + 1 paid = 24.54 € − 2.55 € offer = 21.99 €", async () => {
  const line = cartLine("prod_moyata_patso", 0, 2, [
    { sel: MEAT, price: 0 },
    { sel: DAIRY, price: 0 },
    { sel: VEG, price: 0 },
    { sel: PAID_MEAT, price: 2.56 },
  ]);
  assert.equal(lineUnitPreviewEur(line), 12.27);
  assert.equal(linePreviewTotalEur(line), 24.54);

  const r = await placeOrder(input(payload([line])), deps);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const row = await db.order.findUnique({
    where: { orderNumber: r.orderNumber },
    include: { items: true },
  });
  assert.equal(Number(row?.subtotalEur), 24.54);
  assert.equal(Number(row?.discountEur), 2.55);
  assert.equal(Number(row?.totalEur), 21.99);
  const item = row!.items[0];
  assert.equal(item.quantity, 2);
  assert.equal(Number(item.unitPriceEur), 9.71); // base only
  assert.equal(Number(item.totalPriceEur), 24.54);
  const saved = parseOrderItemExtras(item.extrasJson);
  assert.equal(saved.length, 4);
  assert.equal(saved.filter((e) => e.type === "pizza_free_topping").length, 3);
  assert.equal(saved.reduce((s, e) => s + e.totalPriceEur, 0), 2.56); // charged once per pizza
});

test("maths: a mixed basket — preview total equals the server total to the cent", async () => {
  const lines = [
    cartLine("prod_margarita", 1, 3, [{ sel: PAID_MEAT, price: 3.07 }]), // (12.78 + 3.07) × 3 = 47.55
    cartLine("prod_moyata_patso", 0, 1, [{ sel: VEG, price: 0 }]), //         9.71
  ];
  const preview = lines.reduce((s, l) => Math.round((s + linePreviewTotalEur(l)) * 100) / 100, 0);
  assert.equal(preview, 57.26);

  const r = await placeOrder(input(payload(lines)), deps);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const row = await db.order.findUnique({ where: { orderNumber: r.orderNumber } });
  assert.equal(Number(row?.totalEur), preview);
});

test("maths: a 4th free topping in a crafted request refuses the whole order", async () => {
  const before = await db.order.count();
  const line = cartLine("prod_moyata_patso", 0, 1, [
    { sel: MEAT, price: 0 },
    { sel: DAIRY, price: 0 },
    { sel: FISH, price: 0 },
    { sel: VEG, price: 0 },
  ]);
  const r = await placeOrder(input(payload([line, cartLine("prod_margarita", 0, 1, [])])), deps);
  assert.deepEqual(r, { ok: false, error: "EXTRAS_INVALID" });
  assert.equal(await db.order.count(), before);
});

// ── Basket editing ─────────────────────────────────────────────────────────

test("basket: editing a line replaces it in place and keeps the others", () => {
  const store = useCartStore.getState();
  store.clear();
  const pizza = MENU.prod_moyata_patso;
  const [v30, v40] = pizza.variants!;
  store.addProduct(MENU.prod_margarita, MENU.prod_margarita.variants![0], 1, []);
  store.addProduct(pizza, v30, 1, [MEAT]);
  store.addProduct(MENU.prod_sauce, undefined, 1, []);
  const editedId = useCartStore.getState().items[1].lineId;

  useCartStore.getState().replaceItem(editedId, pizza, v40, 2, [MEAT, VEG]);
  const items = useCartStore.getState().items;
  assert.equal(items.length, 3);
  assert.equal(items[1].product.id, "prod_moyata_patso");
  assert.equal(items[1].selectedVariant?.id, v40.id);
  assert.equal(items[1].quantity, 2);
  assert.deepEqual(items[1].extras.map((e) => e.key), [MEAT.key, VEG.key]);
});

test("basket: an edit that makes two lines identical merges them", () => {
  const store = useCartStore.getState();
  store.clear();
  const pizza = MENU.prod_moyata_patso;
  const v30 = pizza.variants![0];
  store.addProduct(pizza, v30, 1, [MEAT]);
  store.addProduct(pizza, v30, 2, [DAIRY]);
  const second = useCartStore.getState().items[1].lineId;
  useCartStore.getState().replaceItem(second, pizza, v30, 2, [MEAT]);
  const items = useCartStore.getState().items;
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 3);
});

test("basket: quantities stay within 1–99 (the server's limit)", () => {
  const store = useCartStore.getState();
  store.clear();
  store.addProduct(MENU.prod_sauce, undefined, 98, []);
  store.addProduct(MENU.prod_sauce, undefined, 5, []);
  const [line] = useCartStore.getState().items;
  assert.equal(line.quantity, 99);
  useCartStore.getState().updateQuantity(line.lineId, 0);
  assert.equal(useCartStore.getState().items[0].quantity, 1);
  useCartStore.getState().clear();
});

// ── The phone ──────────────────────────────────────────────────────────────

test("phone: 064 801 999 dials as tel:+35964801999", () => {
  assert.equal(telHref("064 801 999"), "tel:+35964801999");
  assert.equal(telHref("+359 64 801 999"), "tel:+35964801999");
});

// ── Opening hours 11:00 – 22:30, Europe/Sofia ──────────────────────────────

test("hours: the shipped fallback is 11:00 – 22:30 on every working day", async () => {
  const { fallbackSettings } = await import("@/lib/restaurant-settings");
  for (const day of Object.values(fallbackSettings().hours)) {
    assert.deepEqual(day, { open: true, from: "11:00", to: "22:30" });
  }
});

test("hours: open from 11:00 to 22:29 Sofia time, closed at 22:30 — in summer and in winter", async () => {
  const { fallbackSettings } = await import("@/lib/restaurant-settings");
  const { resolveHoursStatus } = await import("@/lib/store-hours");
  const hours = fallbackSettings().hours;
  // Sofia is UTC+3 in summer (EEST) and UTC+2 in winter (EET).
  const cases: [string, boolean][] = [
    ["2026-07-15T07:59:00Z", false], // 10:59 EEST
    ["2026-07-15T08:00:00Z", true], //  11:00 EEST
    ["2026-07-15T19:29:00Z", true], //  22:29 EEST
    ["2026-07-15T19:30:00Z", false], // 22:30 EEST
    ["2026-01-15T08:59:00Z", false], // 10:59 EET
    ["2026-01-15T09:00:00Z", true], //  11:00 EET
    ["2026-01-15T20:29:00Z", true], //  22:29 EET
    ["2026-01-15T20:30:00Z", false], // 22:30 EET
  ];
  for (const [iso, open] of cases) {
    assert.equal(resolveHoursStatus(hours, new Date(iso)).open, open, iso);
  }
});
