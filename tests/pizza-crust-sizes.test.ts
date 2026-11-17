/**
 * Crusts (борд) on pizzas whose size label also carries the weight —
 * "30 см / 400g", "40 см / 800g" (Маргарита, Кашкавалина in production).
 *
 * Until 2026-11-17 the size parser read EVERY number in the label, saw 30 and
 * 400 as a conflict and returned "size unknown": the product page showed all
 * four crusts (and every paid topping) as "Недостъпно за този размер", the
 * server would have refused them, and the two pizzas never took part in
 * "Грешна математика". The crust prices are the existing ones from the
 * database row (3.58 € for 30 см, 4.60 € for 40 см) — nothing new is invented.
 *
 * Runs on a temp SQLite built by the real migrations (tests/setup-env.mjs).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { placeOrder, type PlaceOrderInput } from "@/lib/checkout/place-order";
import { resolveOrderItemExtras, type ExtraSourceProduct } from "@/lib/extras-resolve";
import {
  PIZZA_CRUST_SOURCE_PRODUCT_ID,
  PIZZA_SELECTIONS,
  findVariantForSize,
  parseOrderItemExtras,
  parseVariantSize,
  type ExtraSelection,
} from "@/lib/extras-rules";
import { comboSizeOf } from "@/lib/pizza-math";
import { getOrderByNumber } from "@/lib/orders";
import { buildTicketModel } from "@/lib/printer/ticket-model";
import { linePreviewTotalEur, useCartStore } from "@/store/cart-store";
import type { Product } from "@/types/product";
import type { CartItem } from "@/types/cart";
import { ALL_CONSENTS, CONTACT, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

// ── The parser ─────────────────────────────────────────────────────────────

test("size: the weight next to the size is not a second size", () => {
  assert.equal(parseVariantSize("30 см / 400g"), 30);
  assert.equal(parseVariantSize("40 см / 800g"), 40);
  assert.equal(parseVariantSize("30 cm / 400g"), 30);
  assert.equal(parseVariantSize("30см (400 гр)"), 30);
  assert.equal(parseVariantSize("30 см / 400g / 30 cm / 400g"), 30); // bg + en snapshot
});

test("size: what worked before still works, conflicts are still refused", () => {
  assert.equal(parseVariantSize("30 см"), 30);
  assert.equal(parseVariantSize("40 cm"), 40);
  assert.equal(parseVariantSize("30 см / 30 cm"), 30);
  assert.equal(parseVariantSize("30"), 30);
  assert.equal(parseVariantSize("30 см / 40 cm"), null); // two different sizes
  assert.equal(parseVariantSize("30 / 40"), null);
  assert.equal(parseVariantSize("голяма"), null);
  assert.equal(parseVariantSize(null), null);
  assert.equal(parseVariantSize("400g"), 400); // no unit → unchanged fallback
});

test("size: a weight-labelled pizza takes part in «Грешна математика» again", () => {
  assert.equal(comboSizeOf({ categoryId: "cat_pizzas_standard", variantName: "30 см / 400g" }), 30);
  assert.equal(comboSizeOf({ categoryId: "cat_pizzas_standard", variantName: "40 см / 800g" }), 40);
});

// ── A menu shaped like production ──────────────────────────────────────────

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

const MARGARITA = product({
  id: "prod_margarita",
  name: "Маргарита",
  categoryId: "cat_pizzas_standard",
  priceEur: 6.65,
  variants: [
    { id: "var_margarita_1", name: "30 см / 400g", priceEur: 6.65 },
    { id: "var_margarita_2", name: "40 см / 800g", priceEur: 10.23 },
  ],
});
// The ONE existing crust row: four flavours, one price per size.
const BORD = product({
  id: PIZZA_CRUST_SOURCE_PRODUCT_ID,
  name: "Кашкавален / Филаделфия / Кренвирш / Пеперони борд",
  categoryId: "cat_pizza_addons",
  priceEur: 3.58,
  variants: [
    { id: "var_kashkavalen_filadelfiya_krenvirsh_peperoni_bord_1", name: "30 см", priceEur: 3.58 },
    { id: "var_kashkavalen_filadelfiya_krenvirsh_peperoni_bord_2", name: "40 см", priceEur: 4.6 },
  ],
});
const MENU: Record<string, Product> = { [MARGARITA.id]: MARGARITA, [BORD.id]: BORD };
const deps = { getProduct: async (id: string) => MENU[id] ?? null };

const sources = new Map<string, ExtraSourceProduct>([
  [
    BORD.id,
    {
      id: BORD.id,
      categoryId: BORD.categoryId,
      isAvailable: true,
      nameBg: BORD.name,
      nameEn: BORD.name,
      priceEur: BORD.priceEur,
      variants: BORD.variants!.map((v) => ({ ...v, nameBg: v.name, nameEn: v.name.replace("см", "cm") })),
    },
  ],
]);

const CRUST_KEYS = Object.keys(PIZZA_SELECTIONS) as (keyof typeof PIZZA_SELECTIONS)[];
const crust = (k: keyof typeof PIZZA_SELECTIONS): ExtraSelection => ({
  key: k,
  sourceProductId: PIZZA_CRUST_SOURCE_PRODUCT_ID,
  quantity: 1,
});
const resolve = (size: string, selections: ExtraSelection[]) =>
  resolveOrderItemExtras({
    mainProduct: { id: MARGARITA.id, categoryId: MARGARITA.categoryId },
    mainVariantName: size,
    selections,
    sourceProducts: sources,
  });

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

// ── Server pricing ─────────────────────────────────────────────────────────

test("server: each of the four crusts on «30 см / 400g» = 3.58 €, on «40 см / 800g» = 4.60 €", () => {
  for (const k of CRUST_KEYS) {
    for (const [size, price, variantId] of [
      ["30 см / 400g", 3.58, "var_kashkavalen_filadelfiya_krenvirsh_peperoni_bord_1"],
      ["40 см / 800g", 4.6, "var_kashkavalen_filadelfiya_krenvirsh_peperoni_bord_2"],
    ] as const) {
      const r = resolve(size, [crust(k)]);
      assert.equal(r.ok, true, `${k} ${size}: ${JSON.stringify(r)}`);
      if (!r.ok) continue;
      assert.equal(r.extras.length, 1);
      assert.equal(r.extras[0].type, "pizza_crust");
      assert.equal(r.extras[0].nameBg, PIZZA_SELECTIONS[k].nameBg);
      assert.equal(r.extras[0].unitPriceEur, price);
      assert.equal(r.extras[0].sourceVariantId, variantId);
      assert.equal(r.extrasUnitTotalEur, price);
    }
  }
});

test("server: still only ONE crust per pizza", () => {
  const r = resolve("30 см / 400g", [crust("cheese_crust"), crust("pepperoni_crust")]);
  assert.deepEqual(r, { ok: false, code: "multiple-crusts" });
});

test("product page data: the crust row's sizes match both pizza sizes exactly once", () => {
  const variants = sources.get(BORD.id)!.variants;
  assert.equal(findVariantForSize(variants, parseVariantSize("30 см / 400g")!)?.priceEur, 3.58);
  assert.equal(findVariantForSize(variants, parseVariantSize("40 см / 800g")!)?.priceEur, 4.6);
});

// ── Basket ─────────────────────────────────────────────────────────────────

const cartLine = (variantIdx: 0 | 1, crustPrice: number | null): CartItem => {
  const v = MARGARITA.variants![variantIdx];
  return {
    lineId: "x",
    product: MARGARITA,
    selectedVariant: v,
    quantity: 2,
    unitPrice: v.priceEur,
    extras:
      crustPrice === null
        ? []
        : [{ ...crust("philadelphia_crust"), display: { nameBg: "Филаделфия борд", nameEn: "Philadelphia crust", unitPriceEur: crustPrice } }],
  };
};

test("basket: the crust is kept and priced; removing it drops the price; 30 ⇄ 40 re-prices it", () => {
  assert.equal(linePreviewTotalEur(cartLine(0, 3.58)), 20.46); // (6.65 + 3.58) × 2
  assert.equal(linePreviewTotalEur(cartLine(0, null)), 13.3); //  6.65 × 2
  assert.equal(linePreviewTotalEur(cartLine(1, 4.6)), 29.66); // (10.23 + 4.60) × 2

  useCartStore.setState({ items: [] });
  const [v30, v40] = MARGARITA.variants!;
  useCartStore.getState().addProduct(MARGARITA, v30, 1, [crust("sausage_crust")]);
  const before = useCartStore.getState().items[0];
  assert.deepEqual(before.extras.map((e) => e.key), ["sausage_crust"]);
  useCartStore.getState().replaceItem(before.lineId, MARGARITA, v40, 1, [crust("sausage_crust")]);
  const items = useCartStore.getState().items;
  assert.equal(items.length, 1);
  assert.equal(items[0].selectedVariant?.id, v40.id);
  assert.deepEqual(items[0].extras.map((e) => e.key), ["sausage_crust"]);
});

// ── Order + kitchen ─────────────────────────────────────────────────────────

test("order: 30 cm with a cheese crust and 40 cm with a pepperoni crust are charged, saved and printed with the crust", async () => {
  const r = await placeOrder(
    input([
      { productId: MARGARITA.id, variantId: "var_margarita_1", quantity: 1, extras: [crust("cheese_crust")] },
      { productId: MARGARITA.id, variantId: "var_margarita_2", quantity: 1, extras: [crust("pepperoni_crust")] },
    ]),
    deps
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;

  const row = await db.order.findUnique({ where: { orderNumber: r.orderNumber }, include: { items: true } });
  assert.ok(row);
  // (6.65 + 3.58) + (10.23 + 4.60) = 25.06; the 40+30 combo applies to the
  // base prices only (6.65 + 10.23 = 16.88 → 19.43 is dearer, so no discount).
  assert.equal(Number(row.subtotalEur), 25.06);
  const byVariant = new Map(row.items.map((i) => [i.variantId, i]));
  const i30 = byVariant.get("var_margarita_1")!;
  const i40 = byVariant.get("var_margarita_2")!;
  assert.equal(Number(i30.totalPriceEur), 10.23);
  assert.equal(Number(i40.totalPriceEur), 14.83);
  assert.deepEqual(
    parseOrderItemExtras(i30.extrasJson).map((e) => [e.nameBg, e.unitPriceEur, e.sizeContext]),
    [["Кашкавален борд", 3.58, "30 см"]]
  );
  assert.deepEqual(
    parseOrderItemExtras(i40.extrasJson).map((e) => [e.nameBg, e.unitPriceEur, e.sizeContext]),
    [["Пеперони борд", 4.6, "40 см"]]
  );

  // The kitchen ticket (web, admin preview, Android print) carries the crust.
  const order = await getOrderByNumber(r.orderNumber);
  assert.ok(order);
  const lines = buildTicketModel(order).groups.flatMap((g) => g.lines);
  const crustsOnTicket = lines.flatMap((l) => l.extras.map((e) => `${l.size} → ${e.name} ${e.unitPriceEur}`)).sort();
  assert.ok(crustsOnTicket.some((s) => s.includes("30 см") && s.includes("Кашкавален борд")), JSON.stringify(crustsOnTicket));
  assert.ok(crustsOnTicket.some((s) => s.includes("40 см") && s.includes("Пеперони борд")), JSON.stringify(crustsOnTicket));
});
