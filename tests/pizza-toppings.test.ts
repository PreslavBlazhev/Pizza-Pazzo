/**
 * The owner's concrete pizza toppings and the "no add-ons on their own" rule
 * (2026-10-13), proven on the server code itself:
 *
 *   - the registry: exactly 39 toppings, 15 vegetable + 24 meat/dairy/fish,
 *     no duplicates, the generic four retired
 *   - the prices per ONE topping on ONE pizza: 2.05/2.56 € and 2.56/3.07 €,
 *     in the migration AND in the seed
 *   - a 30 → 40 cm change keeps the same toppings and re-prices them
 *   - several toppings × quantity > 1, summed in whole cents (no float drift)
 *   - the server re-derives every price and refuses what is not allowed:
 *     tampered prices, unknown/retired keys, a topping on a burger, an
 *     add-on as a line of its own, a switched-off ingredient
 *   - the saved order keeps the concrete names and charged prices; an old
 *     order's generic snapshot still reads back unchanged
 *   - the migration is idempotent and never overwrites an admin edit
 *
 * Runs on a brand-new temp SQLite built by the real migrations
 * (tests/setup-env.mjs); nothing touches prisma/dev.db or Render.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { placeOrder, type PlaceOrderInput } from "@/lib/checkout/place-order";
import { resolveOrderItemExtras, type ExtraSourceProduct } from "@/lib/extras-resolve";
import {
  EXTRAS_LIMITS,
  PIZZA_TOPPINGS,
  PIZZA_TOPPING_GROUPS,
  RETIRED_EXTRA_KEYS,
  freeToppingKeyFor,
  isAddonOnlyCategory,
  lineIdFor,
  parseOrderItemExtras,
  pizzaToppingKeyFor,
  type ExtraSelection,
} from "@/lib/extras-rules";
import { cartLineIssue } from "@/lib/cart-display";
import { unavailableCartProducts } from "@/app/actions/cart";
import { linePreviewTotalEur, useCartStore } from "@/store/cart-store";
import type { CartItem } from "@/types/cart";
import type { Product } from "@/types/product";
import { ALL_CONSENTS, CONTACT, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

// ── The registry ───────────────────────────────────────────────────────────

const OWNER_VEGETABLE = [
  "Червена чушка", "Зелена чушка", "Печена чушка", "Гъби", "Царевица", "Халапеньос",
  "Червен лук", "Чери домати", "Домати", "Рукола", "Маслини", "Босилек", "Ананас",
  "Кисели краставички", "Сушени домати",
];
const OWNER_MEAT_DAIRY_FISH = [
  "Пилешка шунка", "Свинска шунка", "Пикантно телешко", "Пеперони", "Шпек", "Луканка",
  "Кренвирш", "Бекон", "Телешки бургер", "Яйце", "Рачешки рулца", "Риба тон", "Аншоа",
  "Кашкавал", "Краве сирене", "Моцарела", "Синьо сирене", "Грана падано", "Топено сирене",
  "Филаделфия", "Чедър", "Пушена сьомга", "Гауда", "Ементал",
];

test("registry: 15 vegetable + 24 meat/dairy/fish = 39, exactly the owner's list and order", () => {
  assert.equal(PIZZA_TOPPINGS.length, 39);
  assert.deepEqual(
    PIZZA_TOPPINGS.filter((t) => t.group === "vegetable").map((t) => t.nameBg),
    OWNER_VEGETABLE
  );
  assert.deepEqual(
    PIZZA_TOPPINGS.filter((t) => t.group === "meat_dairy_fish").map((t) => t.nameBg),
    OWNER_MEAT_DAIRY_FISH
  );
  // Pineapple stays a vegetable topping, as the owner grouped it.
  assert.equal(PIZZA_TOPPINGS.find((t) => t.nameBg === "Ананас")?.group, "vegetable");
});

test("registry: no duplicate ids, slugs, or names in either language", () => {
  for (const field of ["productId", "slug", "nameBg", "nameEn"] as const) {
    assert.equal(new Set(PIZZA_TOPPINGS.map((t) => t[field])).size, 39, field);
  }
  for (const t of PIZZA_TOPPINGS) {
    assert.match(t.productId, /^prod_topping_[a-z_]+$/);
    assert.ok(t.nameEn.trim().length > 0);
  }
});

test("registry: group prices are the owner's, per ONE topping on ONE pizza", () => {
  assert.deepEqual(
    { p30: PIZZA_TOPPING_GROUPS.vegetable.price30Eur, p40: PIZZA_TOPPING_GROUPS.vegetable.price40Eur },
    { p30: 2.05, p40: 2.56 }
  );
  assert.deepEqual(
    {
      p30: PIZZA_TOPPING_GROUPS.meat_dairy_fish.price30Eur,
      p40: PIZZA_TOPPING_GROUPS.meat_dairy_fish.price40Eur,
    },
    { p30: 2.56, p40: 3.07 }
  );
});

test("seed JSON: all 39 toppings with exact 30/40 cm prices; the generic two switched off", () => {
  const seed = JSON.parse(readFileSync("data/pizza-pazzo-menu.json", "utf8")) as {
    id: string;
    categoryId: string;
    isAvailable: boolean;
    variants?: { id: string; name: { bg: string }; priceEur: number }[];
  }[];
  for (const t of PIZZA_TOPPINGS) {
    const row = seed.find((p) => p.id === t.productId);
    assert.ok(row, t.productId);
    assert.equal(row.categoryId, "cat_pizza_addons");
    const g = PIZZA_TOPPING_GROUPS[t.group];
    assert.deepEqual(
      row.variants?.map((v) => [v.name.bg, v.priceEur]),
      [["30 см", g.price30Eur], ["40 см", g.price40Eur]],
      t.nameBg
    );
  }
  for (const id of ["prod_mesni_mlechni_ribni", "prod_zelenchukovi"]) {
    assert.equal(seed.find((p) => p.id === id)?.isAvailable, false, id);
  }
});

// ── A menu with the real ids the rules are keyed on ────────────────────────

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
  prod_margarita: product({
    id: "prod_margarita",
    name: "Маргарита",
    categoryId: "cat_pizzas_standard",
    priceEur: 9.71,
    variants: sized("var_margarita", 9.71, 12.78),
  }),
  prod_moyata_patso: product({
    id: "prod_moyata_patso",
    categoryId: "cat_pizzas_standard",
    priceEur: 9.71,
    variants: sized("var_moyata", 9.71, 12.78),
  }),
  prod_burger: product({ id: "prod_burger", categoryId: "cat_burgers", priceEur: 8.69 }),
  prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord: product({
    id: "prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord",
    categoryId: "cat_pizza_addons",
    priceEur: 3.58,
    variants: sized("var_bord", 3.58, 4.6),
  }),
  prod_chedar: product({ id: "prod_chedar", name: "Чедър", categoryId: "cat_burger_addons", priceEur: 0.77 }),
  prod_mesni_mlechni_ribni: product({
    id: "prod_mesni_mlechni_ribni",
    categoryId: "cat_pizza_addons",
    priceEur: 2.56,
    isAvailable: false,
    variants: sized("var_mmr", 2.56, 3.07),
  }),
  prod_sauce: product({ id: "prod_sauce", name: "BBQ", categoryId: "cat_sauces", priceEur: 1.02 }),
};
// Every one of the 39 toppings, named and priced as the migration creates it.
for (const t of PIZZA_TOPPINGS) {
  const g = PIZZA_TOPPING_GROUPS[t.group];
  MENU[t.productId] = product({
    id: t.productId,
    name: t.nameBg,
    categoryId: "cat_pizza_addons",
    priceEur: g.price30Eur,
    variants: sized(`var_${t.productId.slice(5)}`, g.price30Eur, g.price40Eur),
  });
}
const NAMES_EN = new Map(PIZZA_TOPPINGS.map((t) => [t.productId, t.nameEn]));

const deps = {
  getProduct: async (id: string, locale: "bg" | "en") => {
    const p = MENU[id];
    if (!p) return null;
    return locale === "en" && NAMES_EN.has(id) ? { ...p, name: NAMES_EN.get(id)! } : p;
  },
};

const sources = new Map<string, ExtraSourceProduct>(
  Object.values(MENU).map((p) => [
    p.id,
    {
      id: p.id,
      categoryId: p.categoryId,
      isAvailable: p.isAvailable,
      nameBg: p.name,
      nameEn: NAMES_EN.get(p.id) ?? p.name,
      priceEur: p.priceEur,
      variants: (p.variants ?? []).map((v) => ({ ...v, nameBg: v.name, nameEn: v.name.replace("см", "cm") })),
    },
  ])
);

const paid = (productId: string): ExtraSelection => ({
  key: pizzaToppingKeyFor(productId),
  sourceProductId: productId,
  quantity: 1,
});
const free = (productId: string): ExtraSelection => ({
  key: freeToppingKeyFor(productId),
  sourceProductId: productId,
  quantity: 1,
});

const GABI = "prod_topping_gabi"; // vegetable
const ANANAS = "prod_topping_ananas"; // vegetable
const BEKON = "prod_topping_bekon"; // meat
const KASHKAVAL = "prod_topping_kashkaval"; // dairy
const RIBA_TON = "prod_topping_riba_ton"; // fish

/** `size: null` = a product with no size (a burger, or a pizza line without one). */
const resolve = (productId: string, selections: ExtraSelection[], size: string | null = "30 см") =>
  resolveOrderItemExtras({
    mainProduct: { id: productId, categoryId: MENU[productId].categoryId },
    mainVariantName: size ?? undefined,
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

// ── Prices for 30 and 40 cm ────────────────────────────────────────────────

test("prices: every one of the 39 toppings is charged exactly the owner's price at 30 and 40 cm", () => {
  for (const t of PIZZA_TOPPINGS) {
    const g = PIZZA_TOPPING_GROUPS[t.group];
    for (const [size, expected] of [["30 см", g.price30Eur], ["40 см", g.price40Eur]] as const) {
      const r = resolve("prod_margarita", [paid(t.productId)], size);
      assert.equal(r.ok, true, `${t.nameBg} ${size}`);
      if (!r.ok) continue;
      assert.equal(r.extras[0].unitPriceEur, expected, `${t.nameBg} ${size}`);
      assert.equal(r.extras[0].type, "pizza_addon");
      assert.equal(r.extras[0].nameBg, t.nameBg);
      assert.equal(r.extras[0].nameEn, t.nameEn);
      assert.equal(r.extras[0].sizeContext, size);
      assert.equal(r.extrasUnitTotalEur, expected);
    }
  }
});

test("size change: the same toppings re-priced from 30 to 40 cm, nothing dropped", () => {
  const picks = [paid(GABI), paid(BEKON), paid(KASHKAVAL)];
  const r30 = resolve("prod_margarita", picks, "30 см");
  const r40 = resolve("prod_margarita", picks, "40 см");
  assert.ok(r30.ok && r40.ok);
  if (!r30.ok || !r40.ok) return;
  assert.deepEqual(r30.extras.map((e) => e.key), r40.extras.map((e) => e.key));
  assert.equal(r30.extrasUnitTotalEur, 7.17); // 2.05 + 2.56 + 2.56
  assert.equal(r40.extrasUnitTotalEur, 8.7); //  2.56 + 3.07 + 3.07
});

test("size change in the basket: editing a line 30 → 40 cm keeps its toppings on the new line", () => {
  useCartStore.setState({ items: [] });
  const pizza = MENU.prod_margarita;
  const [v30, v40] = pizza.variants!;
  const extras = [paid(GABI), paid(BEKON)];
  useCartStore.getState().addProduct(pizza, v30, 1, extras);
  const before = useCartStore.getState().items[0];
  useCartStore.getState().replaceItem(before.lineId, pizza, v40, 1, extras);
  const after = useCartStore.getState().items;
  assert.equal(after.length, 1);
  assert.equal(after[0].selectedVariant?.id, v40.id);
  assert.deepEqual(after[0].extras.map((e) => e.key), extras.map((e) => e.key));
  assert.notEqual(after[0].lineId, before.lineId);
});

test("money: all 39 toppings on one 40 cm pizza add up to exactly 112.08 € (no float drift)", () => {
  // 15 × 2.56 + 24 × 3.07 = 38.40 + 73.68 = 112.08
  const r = resolve("prod_margarita", PIZZA_TOPPINGS.map((t) => paid(t.productId)), "40 см");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.extras.length, 39);
  assert.equal(r.extrasUnitTotalEur, 112.08);
  assert.ok(EXTRAS_LIMITS.maxExtrasPerItem >= 39 + 1);
});

// ── Several toppings × quantity, end to end ─────────────────────────────────

test("order: 3 × Маргарита 40 cm with mushrooms + bacon + kashkaval = (12.78 + 8.70) × 3 = 64.44 €, saved with names and prices", async () => {
  const r = await placeOrder(
    input([
      {
        productId: "prod_margarita",
        variantId: "var_margarita_40",
        quantity: 3,
        extras: [paid(GABI), paid(BEKON), paid(KASHKAVAL)],
      },
    ]),
    deps
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  const row = await db.order.findUnique({ where: { orderNumber: r.orderNumber }, include: { items: true } });
  assert.ok(row);
  assert.equal(Number(row.subtotalEur), 64.44);
  assert.equal(Number(row.totalEur), 64.44);
  const item = row.items[0];
  assert.equal(Number(item.unitPriceEur), 12.78); // the base stays the base
  assert.equal(Number(item.totalPriceEur), 64.44);
  const saved = parseOrderItemExtras(item.extrasJson);
  assert.deepEqual(
    saved.map((e) => [e.nameBg, e.nameEn, e.unitPriceEur, e.sizeContext, e.sourceVariantId]),
    [
      ["Гъби", "Mushrooms", 2.56, "40 см", "var_topping_gabi_40"],
      ["Бекон", "Bacon", 3.07, "40 см", "var_topping_bekon_40"],
      ["Кашкавал", "Kashkaval (yellow cheese)", 3.07, "40 см", "var_topping_kashkaval_40"],
    ]
  );
});

test("order: the basket preview equals what the server charges for the same line", async () => {
  const pizza = MENU.prod_margarita;
  const v30 = pizza.variants![0];
  const line: CartItem = {
    lineId: "x",
    product: pizza,
    selectedVariant: v30,
    quantity: 2,
    unitPrice: v30.priceEur,
    extras: [GABI, ANANAS, RIBA_TON].map((id) => ({
      ...paid(id),
      display: { nameBg: id, nameEn: id, unitPriceEur: MENU[id].variants![0].priceEur },
    })),
  };
  // (9.71 + 2.05 + 2.05 + 2.56) × 2 = 32.74
  assert.equal(linePreviewTotalEur(line), 32.74);
  const r = await placeOrder(
    input([{ productId: pizza.id, variantId: v30.id, quantity: 2, extras: [paid(GABI), paid(ANANAS), paid(RIBA_TON)] }]),
    deps
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  const row = await db.order.findUnique({ where: { orderNumber: r.orderNumber } });
  assert.equal(Number(row?.subtotalEur), 32.74);
});

test("free toppings on «Моята Пацо» are concrete ingredients at 0 €, named for the kitchen", () => {
  const r = resolve("prod_moyata_patso", [free(BEKON), free(GABI), free(KASHKAVAL), paid(BEKON)]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(
    r.extras.filter((e) => e.type === "pizza_free_topping").map((e) => [e.nameBg, e.totalPriceEur]),
    [["Безплатна добавка: Бекон", 0], ["Безплатна добавка: Гъби", 0], ["Безплатна добавка: Кашкавал", 0]]
  );
  assert.equal(r.extrasUnitTotalEur, 2.56); // only the paid bacon
  assert.deepEqual(resolve("prod_moyata_patso", [free(BEKON), free(GABI), free(KASHKAVAL), free(RIBA_TON)]), {
    ok: false,
    code: "too-many-free-toppings",
  });
  assert.deepEqual(resolve("prod_margarita", [free(GABI)]), { ok: false, code: "not-allowed-for-product" });
});

// ── Server validation ──────────────────────────────────────────────────────

test("server: a price sent by the browser is refused outright (strict payload)", async () => {
  const r = await placeOrder(
    input([
      {
        productId: "prod_margarita",
        variantId: "var_margarita_30",
        quantity: 2,
        extras: [{ ...paid(BEKON), unitPriceEur: 0 }],
      },
    ]),
    deps
  );
  assert.deepEqual(r, { ok: false, error: "CART_INVALID" });
});

test("server: only toppings from the list, only on pizzas, only once each", () => {
  // The crust's price row used as if it were a topping.
  assert.deepEqual(
    resolve("prod_margarita", [paid("prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord")]),
    { ok: false, code: "unknown-key" }
  );
  // A burger add-on dressed up as a pizza topping.
  assert.deepEqual(resolve("prod_margarita", [paid("prod_chedar")]), { ok: false, code: "unknown-key" });
  // A real topping, but the key and the source product disagree.
  assert.deepEqual(
    resolve("prod_margarita", [{ key: pizzaToppingKeyFor(GABI), sourceProductId: BEKON, quantity: 1 }]),
    { ok: false, code: "key-product-mismatch" }
  );
  // Twice the same topping, or a quantity of 2.
  assert.deepEqual(resolve("prod_margarita", [paid(GABI), paid(GABI)]), { ok: false, code: "duplicate-selection" });
  assert.deepEqual(resolve("prod_margarita", [{ ...paid(GABI), quantity: 2 }]), { ok: false, code: "bad-quantity" });
  // Pizza toppings are not burger add-ons.
  assert.deepEqual(resolve("prod_burger", [paid(BEKON)], null), { ok: false, code: "not-allowed-for-product" });
  // No size → no price, never a guess.
  assert.deepEqual(resolve("prod_margarita", [paid(BEKON)], null), { ok: false, code: "no-main-size" });
});

test("server: the retired generic options are refused — never mapped to an ingredient", async () => {
  for (const retired of RETIRED_EXTRA_KEYS) {
    const r = resolve("prod_moyata_patso", [
      { key: retired, sourceProductId: "prod_mesni_mlechni_ribni", quantity: 1 },
    ]);
    assert.deepEqual(r, { ok: false, code: "retired-key" }, retired);
  }
  const order = await placeOrder(
    input([
      {
        productId: "prod_margarita",
        variantId: "var_margarita_30",
        quantity: 2,
        extras: [{ key: "meat_addon", sourceProductId: "prod_mesni_mlechni_ribni", quantity: 1 }],
      },
    ]),
    deps
  );
  assert.deepEqual(order, { ok: false, error: "EXTRAS_OUTDATED" });
});

test("server: a switched-off topping is not sold", async () => {
  const before = MENU[ANANAS].isAvailable;
  sources.set(ANANAS, { ...sources.get(ANANAS)!, isAvailable: false });
  assert.deepEqual(resolve("prod_margarita", [paid(ANANAS)]), { ok: false, code: "unavailable" });
  sources.set(ANANAS, { ...sources.get(ANANAS)!, isAvailable: before });
});

test("server: a topping or a burger add-on as a line of its own is refused; a sauce on its own is not", async () => {
  for (const productId of [GABI, "prod_chedar"]) {
    const r = await placeOrder(
      input([
        { productId: "prod_margarita", variantId: "var_margarita_40", quantity: 1 },
        { productId, ...(MENU[productId].variants ? { variantId: MENU[productId].variants![1].id } : {}), quantity: 1 },
      ]),
      deps
    );
    assert.deepEqual(r, { ok: false, error: "ADDON_STANDALONE" }, productId);
  }
  // Other products stay orderable on their own — e.g. a sauce next to a pizza.
  const ok = await placeOrder(
    input([
      { productId: "prod_margarita", variantId: "var_margarita_30", quantity: 1 },
      { productId: "prod_sauce", quantity: 1 },
    ]),
    deps
  );
  assert.equal(ok.ok, true, JSON.stringify(ok));
});

// ── Basket ─────────────────────────────────────────────────────────────────

test("basket: the store refuses an add-on as a line of its own", () => {
  useCartStore.setState({ items: [] });
  useCartStore.getState().addProduct(MENU[GABI], MENU[GABI].variants![0], 1, []);
  useCartStore.getState().addProduct(MENU.prod_chedar, undefined, 1, []);
  assert.equal(useCartStore.getState().items.length, 0);
});

test("basket: different size / toppings / crust / sauces stay separate lines; the same set merges", () => {
  const base = lineIdFor("prod_margarita", "var_margarita_30", [paid(GABI)]);
  assert.notEqual(base, lineIdFor("prod_margarita", "var_margarita_40", [paid(GABI)]));
  assert.notEqual(base, lineIdFor("prod_margarita", "var_margarita_30", [paid(BEKON)]));
  assert.notEqual(base, lineIdFor("prod_margarita", "var_margarita_30", [paid(GABI), paid(BEKON)]));
  assert.notEqual(
    base,
    lineIdFor("prod_margarita", "var_margarita_30", [
      paid(GABI),
      { key: "cheese_crust", sourceProductId: "prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord", quantity: 1 },
    ])
  );
  assert.notEqual(
    base,
    lineIdFor("prod_margarita", "var_margarita_30", [paid(GABI), { key: "sauce:prod_sauce", sourceProductId: "prod_sauce", quantity: 2 }])
  );
  // Same picks in another order → the same line.
  assert.equal(
    lineIdFor("prod_margarita", "var_margarita_30", [paid(GABI), paid(BEKON)]),
    lineIdFor("prod_margarita", "var_margarita_30", [paid(BEKON), paid(GABI)])
  );
});

test("basket: an old basket's standalone add-on and generic «Месна добавка» are flagged, not guessed", () => {
  const pizza = MENU.prod_margarita;
  const v30 = pizza.variants![0];
  const none = new Set<string>();
  const addonLine = { lineId: "a", product: MENU[GABI], quantity: 1, unitPrice: 2.05, extras: [] } as CartItem;
  const oldGeneric = {
    lineId: "b",
    product: pizza,
    selectedVariant: v30,
    quantity: 1,
    unitPrice: v30.priceEur,
    extras: [{ key: "meat_addon", sourceProductId: "prod_mesni_mlechni_ribni", quantity: 1 }],
  } as CartItem;
  const fine = { ...oldGeneric, lineId: "c", extras: [paid(BEKON)] } as CartItem;
  assert.equal(cartLineIssue(addonLine, none), "addon-only");
  assert.equal(cartLineIssue(oldGeneric, none), "extras-outdated");
  assert.equal(cartLineIssue(fine, none), null);
  assert.equal(cartLineIssue(fine, new Set([pizza.id])), "unavailable");
  assert.equal(isAddonOnlyCategory("cat_pizza_addons") && isAddonOnlyCategory("cat_burger_addons"), true);
  assert.equal(isAddonOnlyCategory("cat_sauces"), false);
});

// ── History stays as it was ────────────────────────────────────────────────

test("history: an order saved with the old generic topping still reads back with its original name and price", () => {
  const old = JSON.stringify([
    {
      key: "meat_addon",
      sourceProductId: "prod_mesni_mlechni_ribni",
      sourceVariantId: "var_mesni_mlechni_ribni_1",
      type: "pizza_addon",
      nameBg: "Месна добавка",
      nameEn: "Meat add-on",
      quantity: 1,
      sizeContext: "30 см",
      unitPriceEur: 2.56,
      totalPriceEur: 2.56,
    },
  ]);
  const [e] = parseOrderItemExtras(old);
  assert.deepEqual([e.nameBg, e.nameEn, e.totalPriceEur], ["Месна добавка", "Meat add-on", 2.56]);
});

// ── The migration, on a real database ──────────────────────────────────────

test("migration: creates the 39 toppings once, never duplicates, never overwrites an admin edit", async () => {
  const sql = readFileSync("prisma/migrations/20261013160000_concrete_pizza_toppings/migration.sql", "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

  // The menu as production has it before the update.
  await db.menuCategory.create({
    data: { id: "cat_pizza_addons", slug: "pizza-addons", nameBg: "Пица добавки", nameEn: "Pizza toppings" },
  });
  for (const id of ["prod_mesni_mlechni_ribni", "prod_zelenchukovi"]) {
    await db.menuProduct.create({
      data: { id, slug: id, nameBg: id, nameEn: id, categoryId: "cat_pizza_addons", priceEur: 2.56 },
    });
  }

  for (const s of statements) await db.$executeRawUnsafe(s);
  assert.equal(await db.menuProduct.count({ where: { id: { startsWith: "prod_topping_" } } }), 39);
  assert.equal(await db.menuVariant.count({ where: { productId: { startsWith: "prod_topping_" } } }), 78);

  // The admin edits a price; the update runs again (e.g. by hand).
  await db.menuVariant.update({ where: { id: "var_topping_gabi_30" }, data: { priceEur: 2.2 } });
  for (const s of statements) await db.$executeRawUnsafe(s);
  assert.equal(await db.menuProduct.count({ where: { id: { startsWith: "prod_topping_" } } }), 39);
  assert.equal(await db.menuVariant.count({ where: { productId: { startsWith: "prod_topping_" } } }), 78);
  const gabi = await db.menuVariant.findUnique({ where: { id: "var_topping_gabi_30" } });
  assert.equal(Number(gabi?.priceEur), 2.2);

  const emental40 = await db.menuVariant.findUnique({ where: { id: "var_topping_emental_40" } });
  assert.equal(Number(emental40?.priceEur), 3.07);
  const generic = await db.menuProduct.findMany({
    where: { id: { in: ["prod_mesni_mlechni_ribni", "prod_zelenchukovi"] } },
  });
  assert.deepEqual(generic.map((p) => p.isAvailable), [false, false]);

  // The basket check treats a topping as never on sale on its own.
  assert.deepEqual(await unavailableCartProducts(["prod_topping_gabi"]), ["prod_topping_gabi"]);
});
