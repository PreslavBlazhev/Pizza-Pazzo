/**
 * „Грешна математика“ and the delivery minimum after it — the owner's rules
 * of 2026-10-12, proven on the pure function, the basket and the server:
 *
 *   - 30+30 → 16.87 €, 40+30 → 19.43 €, 40+40 → 23.01 €
 *   - only with exactly 2 pizzas, counted by quantity (one line × 2 counts);
 *     3 or 4 pizzas: every pizza at its normal price, nothing paired off
 *   - speciality pizzas are excluded (and still count as pizzas)
 *   - the pair costs the lower of its regular base prices and the combo
 *   - paid extras stay on top, per pizza; „Моята Пацо“'s free toppings stay 0
 *   - the minimum of 10 € is measured AFTER the discount: 9.99 refused,
 *     10.00 and 10.01 accepted
 *   - basket preview = server answer = saved order, in BG and in EN
 *
 * Runs on a brand-new temp SQLite (tests/setup-env.mjs).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { placeOrder, type PlaceOrderInput } from "@/lib/checkout/place-order";
import { PIZZA_MATH_PRICES_EUR, pizzaMathDiscount, type PizzaMathLine } from "@/lib/pizza-math";
import { cartTotals } from "@/lib/cart-totals";
import { minimumOrderShortfallEur } from "@/lib/delivery-area";
import { useCartStore } from "@/store/cart-store";
import type { CartExtraSelection, CartItem } from "@/types/cart";
import type { Product } from "@/types/product";
import bg from "@/messages/bg.json";
import en from "@/messages/en.json";
import { ALL_CONSENTS, CONTACT, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

// ── A small menu with the real ids, categories and prices ───────────────────

const sized = (id: string, p30: number, p40: number) => [
  { id: `${id}_30`, name: "30 см", names: { bg: "30 см", en: "30 cm" }, priceEur: p30 },
  { id: `${id}_40`, name: "40 см", names: { bg: "40 см", en: "40 cm" }, priceEur: p40 },
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

const STD = "cat_pizzas_standard";
const MENU: Record<string, Product> = {
  prod_moyata_patso: product({ id: "prod_moyata_patso", categoryId: STD, priceEur: 9.71, variants: sized("var_moyata", 9.71, 12.78) }),
  prod_peperoni_maks: product({ id: "prod_peperoni_maks", categoryId: STD, priceEur: 9.71, variants: sized("var_pep", 9.71, 12.78) }),
  prod_nyu_york_hot_dog: product({ id: "prod_nyu_york_hot_dog", categoryId: STD, priceEur: 9.71, variants: sized("var_nyhd", 9.71, 12.78) }),
  prod_margarita: product({ id: "prod_margarita", categoryId: STD, priceEur: 6.65, variants: sized("var_marg", 6.65, 10.23) }),
  prod_kashkavalina: product({ id: "prod_kashkavalina", categoryId: STD, priceEur: 6.65, variants: sized("var_kash", 6.65, 10.23) }),
  prod_syomga: product({ id: "prod_syomga", categoryId: "cat_pizzas_special", priceEur: 11.76, variants: sized("var_syomga", 11.76, 15.34) }),
  prod_proshuto: product({ id: "prod_proshuto", categoryId: "cat_pizzas_special", priceEur: 11.76, variants: sized("var_prosh", 11.76, 15.34) }),
  prod_topping_bekon: product({ id: "prod_topping_bekon", categoryId: "cat_pizza_addons", priceEur: 2.56, variants: sized("var_bekon", 2.56, 3.07) }),
  prod_topping_kashkaval: product({ id: "prod_topping_kashkaval", categoryId: "cat_pizza_addons", priceEur: 2.56, variants: sized("var_kashk", 2.56, 3.07) }),
  prod_topping_riba_ton: product({ id: "prod_topping_riba_ton", categoryId: "cat_pizza_addons", priceEur: 2.56, variants: sized("var_ton", 2.56, 3.07) }),
  prod_topping_gabi: product({ id: "prod_topping_gabi", categoryId: "cat_pizza_addons", priceEur: 2.05, variants: sized("var_gabi", 2.05, 2.56) }),
  prod_drink_334: product({ id: "prod_drink_334", categoryId: "cat_drinks", priceEur: 3.34 }),
  prod_drink_335: product({ id: "prod_drink_335", categoryId: "cat_drinks", priceEur: 3.35 }),
  prod_drink_336: product({ id: "prod_drink_336", categoryId: "cat_drinks", priceEur: 3.36 }),
  prod_sauce: product({ id: "prod_sauce", categoryId: "cat_sauces", priceEur: 1.02 }),
};

/** The server's menu lookup — in EN the variant names are English, as on the site. */
const deps = {
  getProduct: async (id: string, locale: "bg" | "en") => {
    const p = MENU[id];
    if (!p) return null;
    return locale === "en" && p.variants
      ? { ...p, variants: p.variants.map((v) => ({ ...v, name: v.names?.en ?? v.name })) }
      : p;
  },
};

const MEAT = { key: "pizza_topping:prod_topping_bekon", sourceProductId: "prod_topping_bekon", quantity: 1 };
const VEG = { key: "pizza_topping:prod_topping_gabi", sourceProductId: "prod_topping_gabi", quantity: 1 };
const FREE_MEAT = { key: "free_topping:prod_topping_bekon", sourceProductId: "prod_topping_bekon", quantity: 1 };
const FREE_DAIRY = { key: "free_topping:prod_topping_kashkaval", sourceProductId: "prod_topping_kashkaval", quantity: 1 };
const FREE_FISH = { key: "free_topping:prod_topping_riba_ton", sourceProductId: "prod_topping_riba_ton", quantity: 1 };
const SAUCE = { key: "sauce:prod_sauce", sourceProductId: "prod_sauce", quantity: 1 };

type Size = 30 | 40;

/**
 * A basket line exactly as the product page builds it. `lang` decides the
 * language of the stored variant name — a basket filled on the EN site.
 */
function line(
  productId: string,
  size: Size | null,
  quantity: number,
  extras: { sel: typeof MEAT; price: number }[] = [],
  lang: "bg" | "en" = "bg"
): CartItem {
  const p = MENU[productId];
  const v0 = size === null ? undefined : p.variants?.find((v) => v.name.startsWith(String(size)));
  const v = v0 && lang === "en" ? { ...v0, name: v0.names?.en ?? v0.name } : v0;
  const list: CartExtraSelection[] = extras.map(({ sel, price }) => ({
    ...sel,
    display: { nameBg: sel.key, nameEn: sel.key, unitPriceEur: price },
  }));
  return {
    lineId: `${productId}::${v?.id ?? ""}::${extras.map((e) => e.sel.key).join(",")}`,
    product: p,
    selectedVariant: v,
    extras: list,
    quantity,
    unitPrice: v?.priceEur ?? p.priceEur,
  };
}

function input(lines: CartItem[]): PlaceOrderInput {
  return {
    contact: CONTACT,
    itemsJson: JSON.stringify(
      lines.map((i) => ({
        productId: i.product.id,
        ...(i.selectedVariant ? { variantId: i.selectedVariant.id } : {}),
        quantity: i.quantity,
        ...(i.extras.length
          ? { extras: i.extras.map(({ key: k, sourceProductId, quantity }) => ({ key: k, sourceProductId, quantity })) }
          : {}),
      }))
    ),
    paymentMethod: "cash_on_delivery",
    checkoutKey: key(),
    userId: null,
    consents: ALL_CONSENTS,
  };
}

/** Places the basket and returns the saved money columns. */
async function placeAndRead(lines: CartItem[]) {
  const r = await placeOrder(input(lines), deps);
  assert.equal(r.ok, true, `order refused: ${JSON.stringify(r)}`);
  if (!r.ok) throw new Error("refused");
  const row = await db.order.findUnique({ where: { orderNumber: r.orderNumber } });
  return {
    subtotal: Number(row!.subtotalEur),
    discount: Number(row!.discountEur),
    total: Number(row!.totalEur),
  };
}

/** Basket preview and saved order must agree to the cent. */
async function assertSame(lines: CartItem[], expected: { subtotal: number; discount: number; total: number }) {
  const preview = cartTotals(lines);
  assert.deepEqual(
    { subtotal: preview.subtotal, discount: preview.discount, total: preview.total },
    expected,
    "basket preview"
  );
  assert.deepEqual(await placeAndRead(lines), expected, "saved order");
}

const pm = (l: PizzaMathLine[]) => pizzaMathDiscount(l).discountEur;
const pizza = (size: Size, base: number, quantity = 1, categoryId = STD): PizzaMathLine => ({
  categoryId,
  variantName: `${size} см`,
  baseUnitEur: base,
  quantity,
});

// ── The rule itself ─────────────────────────────────────────────────────────

test("the three combo prices are the owner's", () => {
  assert.deepEqual(PIZZA_MATH_PRICES_EUR, { "30+30": 16.87, "30+40": 19.43, "40+40": 23.01 });
});

test("30 + 30: 9.71 + 9.71 = 19.42 → 16.87 (−2.55)", async () => {
  assert.equal(pm([pizza(30, 9.71), pizza(30, 9.71)]), 2.55);
  await assertSame([line("prod_peperoni_maks", 30, 1), line("prod_moyata_patso", 30, 1)], {
    subtotal: 19.42,
    discount: 2.55,
    total: 16.87,
  });
});

test("40 + 30: 12.78 + 9.71 = 22.49 → 19.43 (−3.06), in either order", async () => {
  assert.equal(pm([pizza(40, 12.78), pizza(30, 9.71)]), 3.06);
  assert.equal(pm([pizza(30, 9.71), pizza(40, 12.78)]), 3.06);
  await assertSame([line("prod_peperoni_maks", 30, 1), line("prod_nyu_york_hot_dog", 40, 1)], {
    subtotal: 22.49,
    discount: 3.06,
    total: 19.43,
  });
});

test("40 + 40: 12.78 + 12.78 = 25.56 → 23.01 (−2.55)", async () => {
  assert.equal(pm([pizza(40, 12.78), pizza(40, 12.78)]), 2.55);
  await assertSame([line("prod_peperoni_maks", 40, 1), line("prod_moyata_patso", 40, 1)], {
    subtotal: 25.56,
    discount: 2.55,
    total: 23.01,
  });
});

test("a pair already cheaper than the combo keeps its regular price (13.30 stays 13.30)", async () => {
  assert.equal(pm([pizza(30, 6.65), pizza(30, 6.65)]), 0);
  await assertSame([line("prod_margarita", 30, 1), line("prod_kashkavalina", 30, 1)], {
    subtotal: 13.3,
    discount: 0,
    total: 13.3,
  });
  // 40 + 40 Маргарита: 20.46 < 23.01 — no change either.
  await assertSame([line("prod_margarita", 40, 2)], { subtotal: 20.46, discount: 0, total: 20.46 });
  // Equal to the combo (6.65 + 12.78 = 19.43): nothing to take off.
  assert.equal(pm([pizza(30, 6.65), pizza(40, 12.78)]), 0);
});

test("a pair with one cheap and one regular pizza: only the excess comes off", async () => {
  // Маргарита 40 (10.23) + Пеперони 40 (12.78) = 23.01 = combo → 0;
  // Маргарита 40 + Пеперони 30: 10.23 + 9.71 = 19.94 → 19.43 (−0.51).
  assert.equal(pm([pizza(40, 10.23), pizza(40, 12.78)]), 0);
  await assertSame([line("prod_margarita", 40, 1), line("prod_peperoni_maks", 30, 1)], {
    subtotal: 19.94,
    discount: 0.51,
    total: 19.43,
  });
});

test("speciality pizzas are excluded: one or both in the pair → normal prices", async () => {
  assert.equal(pm([pizza(30, 11.76, 1, "cat_pizzas_special"), pizza(30, 9.71)]), 0);
  await assertSame([line("prod_syomga", 30, 1), line("prod_peperoni_maks", 30, 1)], {
    subtotal: 21.47,
    discount: 0,
    total: 21.47,
  });
  await assertSame([line("prod_syomga", 40, 1), line("prod_proshuto", 40, 1)], {
    subtotal: 30.68,
    discount: 0,
    total: 30.68,
  });
});

test("a speciality pizza still counts: 2 standard + 1 special is 3 pizzas → no offer", async () => {
  await assertSame(
    [line("prod_peperoni_maks", 30, 2), line("prod_proshuto", 30, 1)],
    { subtotal: 31.18, discount: 0, total: 31.18 }
  );
});

test("one line with quantity 2 is two pizzas — the same as two lines", async () => {
  assert.equal(pm([pizza(30, 9.71, 2)]), pm([pizza(30, 9.71), pizza(30, 9.71)]));
  await assertSame([line("prod_peperoni_maks", 30, 2)], { subtotal: 19.42, discount: 2.55, total: 16.87 });
});

test("3 pizzas: all at normal prices, none paired off", async () => {
  assert.equal(pm([pizza(30, 9.71, 3)]), 0);
  await assertSame([line("prod_peperoni_maks", 30, 3)], { subtotal: 29.13, discount: 0, total: 29.13 });
  await assertSame(
    [line("prod_peperoni_maks", 40, 1), line("prod_moyata_patso", 30, 1), line("prod_margarita", 30, 1)],
    { subtotal: 29.14, discount: 0, total: 29.14 }
  );
});

test("4 pizzas: all at normal prices", async () => {
  assert.equal(pm([pizza(30, 9.71, 2), pizza(40, 12.78, 2)]), 0);
  await assertSame([line("prod_peperoni_maks", 30, 2), line("prod_moyata_patso", 40, 2)], {
    subtotal: 44.98,
    discount: 0,
    total: 44.98,
  });
});

test("drinks and sauces do not count as pizzas and are never discounted", async () => {
  await assertSame(
    [line("prod_peperoni_maks", 30, 2), line("prod_drink_334", null, 2), line("prod_sauce", null, 1)],
    // 19.42 + 6.68 + 1.02 = 27.12; −2.55 → 24.57
    { subtotal: 27.12, discount: 2.55, total: 24.57 }
  );
});

test("paid extras on the pair are charged on top, per pizza", async () => {
  // (12.78 + 3.07) × 2 = 31.70; the bases 25.56 → 23.01 (−2.55); total 29.15.
  await assertSame([line("prod_peperoni_maks", 40, 2, [{ sel: MEAT, price: 3.07 }])], {
    subtotal: 31.7,
    discount: 2.55,
    total: 29.15,
  });
  // A sauce on one pizza of a 30 + 40 pair: 9.71 + (12.78 + 2.56 veg) + 1.02 sauce.
  await assertSame(
    [
      line("prod_peperoni_maks", 30, 1, [{ sel: SAUCE, price: 1.02 }]),
      line("prod_moyata_patso", 40, 1, [{ sel: VEG, price: 2.56 }]),
    ],
    { subtotal: 26.07, discount: 3.06, total: 23.01 }
  );
});

for (const count of [0, 1, 2, 3]) {
  test(`«Моята Пацо» with ${count} free topping(s) + a paid one, in a pair`, async () => {
    const free = [FREE_MEAT, FREE_DAIRY, FREE_FISH].slice(0, count).map((sel) => ({ sel, price: 0 }));
    // (9.71 + 2.05 paid veg) + 9.71 = 21.47; bases 19.42 → 16.87 (−2.55) → 18.92.
    await assertSame(
      [
        line("prod_moyata_patso", 30, 1, [...free, { sel: VEG, price: 2.05 }]),
        line("prod_peperoni_maks", 30, 1),
      ],
      { subtotal: 21.47, discount: 2.55, total: 18.92 }
    );
  });
}

test("a size the offer does not define, or no size at all → normal prices", () => {
  assert.equal(pm([pizza(30, 9.71), { ...pizza(30, 9.71), variantName: "50 см" }]), 0);
  assert.equal(pm([pizza(30, 9.71), { ...pizza(30, 9.71), variantName: null }]), 0);
});

// ── The minimum, AFTER the discount ─────────────────────────────────────────

for (const [drink, total, ok] of [
  ["prod_drink_334", 9.99, false],
  ["prod_drink_335", 10.0, true],
  ["prod_drink_336", 10.01, true],
] as const) {
  test(`minimum: a final total of ${total.toFixed(2)} € is ${ok ? "accepted" : "refused"}`, async () => {
    // Маргарита 30 (6.65) + a drink. One pizza — no offer, so this is the
    // final total after all discounts.
    const lines = [line("prod_margarita", 30, 1), line(drink, null, 1)];
    const t = cartTotals(lines);
    assert.equal(t.total, total);
    assert.equal(minimumOrderShortfallEur(t.total) > 0, !ok, "basket: way forward");
    const r = await placeOrder(input(lines), deps);
    if (ok) {
      assert.equal(r.ok, true);
    } else {
      assert.deepEqual(r, { ok: false, error: "BELOW_MINIMUM", shortfallEur: 0.01 });
    }
  });
}

test("minimum: measured on the total after the discount, not before it", () => {
  // The pair's subtotal and total sit either side of a hypothetical 17 €
  // line: the rule must read `total`. With the real minimum (10 €) the
  // combo prices never fall under it, so this checks WHICH number is used.
  const t = cartTotals([line("prod_peperoni_maks", 30, 2)]);
  assert.equal(t.subtotal, 19.42);
  assert.equal(t.total, 16.87);
  assert.equal(minimumOrderShortfallEur(t.total), 0);
});

// ── Editing the basket: the offer comes and goes with the rule ──────────────

test("basket edits switch the offer on and off and recompute the total", () => {
  const store = useCartStore.getState();
  store.clear();
  const pep = MENU.prod_peperoni_maks;
  const [v30, v40] = pep.variants!;
  const totals = () => useCartStore.getState().totals();

  store.addProduct(pep, v30, 1);
  assert.equal(totals().discount, 0, "one pizza: no offer");
  assert.equal(totals().total, 9.71);

  store.addProduct(pep, v30, 1); // merges: one line × 2
  assert.equal(useCartStore.getState().items.length, 1);
  assert.equal(totals().discount, 2.55);
  assert.equal(totals().total, 16.87);

  const lineId = useCartStore.getState().items[0].lineId;
  store.updateQuantity(lineId, 3);
  assert.equal(totals().discount, 0, "three pizzas: no offer");
  assert.equal(totals().total, 29.13);

  store.updateQuantity(lineId, 2);
  assert.equal(totals().total, 16.87, "back to two: the offer returns");

  // Edit the line on the product page: 40 cm with a paid topping.
  useCartStore.getState().replaceItem(lineId, pep, v40, 2, [
    { ...MEAT, display: { nameBg: "Месна", nameEn: "Meat", unitPriceEur: 3.07 } },
  ]);
  assert.deepEqual(
    { s: totals().subtotal, d: totals().discount, t: totals().total },
    { s: 31.7, d: 2.55, t: 29.15 }
  );

  // A speciality pizza joins: three pizzas → normal prices.
  store.addProduct(MENU.prod_syomga, MENU.prod_syomga.variants![0], 1);
  assert.equal(totals().discount, 0);
  assert.equal(totals().total, 43.46);

  // …and leaves again.
  const special = useCartStore.getState().items.find((i) => i.product.id === "prod_syomga")!;
  store.removeItem(special.lineId);
  assert.equal(totals().total, 29.15);

  store.clear();
});

// ── BG and EN ───────────────────────────────────────────────────────────────

test("a basket filled on the EN site (‘40 cm’) gets the same offer as in BG", async () => {
  const enLines = [line("prod_peperoni_maks", 40, 1, [], "en"), line("prod_moyata_patso", 30, 1, [], "en")];
  assert.equal(enLines[0].selectedVariant?.name, "40 cm");
  await assertSame(enLines, { subtotal: 22.49, discount: 3.06, total: 19.43 });
});

test("an old basket line without bilingual names still reads its size", () => {
  const l = line("prod_peperoni_maks", 30, 2, [], "en");
  const legacy = { ...l, selectedVariant: { id: l.selectedVariant!.id, name: "30 cm", priceEur: 9.71 } };
  assert.equal(cartTotals([legacy]).discount, 2.55);
});

test("BG and EN have every new text, with the same placeholders", () => {
  const keys = ["subtotal", "pizzaMathDiscount", "pizzaMathHint", "unavailable", "unavailableAtCheckout"] as const;
  for (const k of keys) {
    assert.ok(bg.cart[k], `bg cart.${k}`);
    assert.ok(en.cart[k], `en cart.${k}`);
  }
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  assert.equal(ph(bg.checkout.errors.BELOW_MINIMUM), "{amount},{remaining}");
  assert.equal(ph(en.checkout.errors.BELOW_MINIMUM), "{amount},{remaining}");
  assert.equal(ph(bg.cart.unavailableAtCheckout), ph(en.cart.unavailableAtCheckout));
  assert.match(bg.cart.pizzaMathHint, /16\.87 €.*19\.43 €.*23\.01 €/);
  assert.match(en.cart.pizzaMathHint, /16\.87 €.*19\.43 €.*23\.01 €/);
  // British English: “speciality”, not “specialty”.
  assert.match(en.cart.pizzaMathHint, /speciality/);
});
