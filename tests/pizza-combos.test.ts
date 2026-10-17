/**
 * B. Two-pizza combos (lib/pizza-math.ts), the server's pricing and the
 * agreement of basket, saved order, ticket and e-mail.
 *
 * The heart of it: for every small basket — standard AND special pizzas
 * mixed — the algorithm's answer is compared with an EXHAUSTIVE enumeration
 * of every way to pair the pizzas (only standard pizzas may pair), in both
 * pricing modes, and with the basket shuffled into every order.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import {
  COMBO_PRICING_MODE,
  PIZZA_COMBO_PRICES_CENTS,
  pizzaMathDiscount,
  type ComboPricingMode,
  type PizzaMathLine,
} from "@/lib/pizza-math";
import { placeOrder } from "@/lib/checkout/place-order";
import { getOrderById } from "@/lib/orders";
import { buildTicketText } from "@/lib/printer/ticket-template";
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import { defaultPrintTemplate } from "@/types/print";
import type { Product } from "@/types/product";
import { ALL_CONSENTS, CONTACT, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

// ── Exhaustive reference ────────────────────────────────────────────────────

interface U {
  size: 30 | 40;
  cents: number;
  /** cat_pizzas_special — never in a pair. */
  special?: boolean;
}

function comboCents(a: U, b: U): number {
  const k = a.size === b.size ? `${a.size}+${a.size}` : "30+40";
  return PIZZA_COMBO_PRICES_CENTS[k as keyof typeof PIZZA_COMBO_PRICES_CENTS];
}

/**
 * The cheapest total over EVERY way to put the STANDARD units into pairs
 * (special units always pay their own price):
 *   never_dearer — any number of pairs, a pair costs min(regular, combo);
 *   fixed        — exactly ⌊n/2⌋ pairs of the n standard units, a pair
 *                  costs the combo price.
 */
function bruteForce(units: U[], mode: ComboPricingMode): number {
  const specials = units.filter((u) => u.special).reduce((s, u) => s + u.cents, 0);
  units = units.filter((u) => !u.special);
  const need = Math.floor(units.length / 2);
  let best = Infinity;
  const rec = (rest: U[], pairs: number, cost: number) => {
    if (rest.length === 0) {
      if (mode === "fixed" && pairs !== need) return;
      best = Math.min(best, cost);
      return;
    }
    const [first, ...others] = rest;
    // `first` stays single…
    rec(others, pairs, cost + first.cents);
    // …or pairs with any of the others.
    for (let i = 0; i < others.length; i++) {
      const partner = others[i];
      const reg = first.cents + partner.cents;
      const c = comboCents(first, partner);
      const price = mode === "fixed" ? c : Math.min(reg, c);
      rec([...others.slice(0, i), ...others.slice(i + 1)], pairs + 1, cost + price);
    }
  };
  rec(units, 0, 0);
  return best + specials;
}

const asLines = (units: U[]): PizzaMathLine[] =>
  units.map((u, i) => ({
    key: `k${i}`,
    categoryId: u.special ? "cat_pizzas_special" : "cat_pizzas_standard",
    variantName: `${u.size} см`,
    baseUnitEur: u.cents / 100,
    quantity: 1,
  }));

const algoTotal = (units: U[], mode: ComboPricingMode) => {
  const regular = units.reduce((s, u) => s + u.cents, 0);
  return regular - pizzaMathDiscount(asLines(units), { mode }).discountCents;
};

/** A small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const PRICES_30 = [665, 971, 1176, 500, 899];
const PRICES_40 = [1023, 1278, 1534, 900, 1999];

test("exhaustive check: 1–8 pizzas (a third of them special), 600 random baskets, both modes — the algorithm is optimal", () => {
  const rand = rng(20261017);
  for (let n = 1; n <= 8; n++) {
    for (let round = 0; round < 75; round++) {
      const units: U[] = Array.from({ length: n }, () => {
        const size = rand() < 0.5 ? 30 : 40;
        const list = size === 30 ? PRICES_30 : PRICES_40;
        return { size, cents: list[Math.floor(rand() * list.length)], special: rand() < 1 / 3 };
      });
      for (const mode of ["never_dearer", "fixed"] as const) {
        assert.equal(algoTotal(units, mode), bruteForce(units, mode), `${mode} ${JSON.stringify(units)}`);
      }
      // The active mode: every pair shown saves money, no special is in one.
      const r = pizzaMathDiscount(asLines(units));
      assert.ok(r.pairs.every((p) => p.discountEur > 0), "no pair without a positive saving");
      assert.ok(r.discountCents >= 0, "never dearer");
      const specialKeys = new Set(asLines(units).filter((l) => l.categoryId === "cat_pizzas_special").map((l) => l.key));
      assert.ok(r.pairs.every((p) => !p.lineKeys.some((k) => specialKeys.has(k))), "no special pizza in a pair");
    }
  }
});

test("the basket's order never changes the result (every permutation of 6 pizzas, one special)", () => {
  const units: U[] = [
    { size: 30, cents: 971 },
    { size: 40, cents: 1278 },
    { size: 30, cents: 665 },
    { size: 40, cents: 1023 },
    { size: 30, cents: 1176 },
    { size: 40, cents: 1534, special: true },
  ];
  const expected = algoTotal(units, "never_dearer");
  const permute = (arr: U[]): U[][] =>
    arr.length <= 1 ? [arr] : arr.flatMap((x, i) => permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  for (const p of permute(units)) {
    assert.equal(algoTotal(p, "never_dearer"), expected);
    assert.equal(algoTotal(p, "fixed"), algoTotal(units, "fixed"));
  }
});

// ── The owner's numbers ─────────────────────────────────────────────────────

const L = (size: 30 | 40, eur: number, quantity = 1, categoryId = "cat_pizzas_standard"): PizzaMathLine => ({
  key: `${size}-${eur}-${categoryId}`,
  categoryId,
  variantName: `${size} см`,
  baseUnitEur: eur,
  quantity,
});
const pay = (lines: PizzaMathLine[], mode: ComboPricingMode = "never_dearer") => {
  const regular = lines.reduce((s, l) => s + Math.round(l.baseUnitEur * 100) * l.quantity, 0);
  return (regular - pizzaMathDiscount(lines, { mode }).discountCents) / 100;
};

test("the three pairs cost exactly 16.87 / 19.43 / 23.01 €, in integer cents", () => {
  assert.deepEqual(PIZZA_COMBO_PRICES_CENTS, { "30+30": 1687, "30+40": 1943, "40+40": 2301 });
  assert.equal(pay([L(30, 9.71), L(30, 9.71)]), 16.87);
  assert.equal(pay([L(40, 12.78), L(30, 9.71)]), 19.43);
  assert.equal(pay([L(40, 12.78), L(40, 12.78)]), 23.01);
  // Two identical pizzas as ONE line with quantity 2.
  assert.equal(pay([L(30, 9.71, 2)]), 16.87);
  assert.equal(pay([L(40, 12.78, 2)]), 23.01);
});

test("special pizzas never pair; 5 standard pizzas = 2 pairs + the cheapest one alone", () => {
  const SP = "cat_pizzas_special";
  assert.equal(pay([L(40, 15.34, 1, SP), L(30, 11.76, 1, SP)]), 27.1, "special + special: regular price");
  assert.equal(pay([L(30, 11.76, 1, SP), L(30, 9.71)]), 21.47, "special + standard: regular price");
  // 3×30 (9.71) + 2×40 (12.78): 2 × (40+30) + one 30 alone = 2×19.43 + 9.71
  assert.equal(pay([L(30, 9.71, 3), L(40, 12.78, 2)]), 48.57);
  // …and two specials next to them change nothing for the standard ones.
  assert.equal(pay([L(30, 9.71, 3), L(40, 12.78, 2), L(40, 15.34, 2, SP)]), 48.57 + 30.68);
  // one pizza: no combo
  assert.equal(pay([L(30, 9.71)]), 9.71);
});

test("3+ standard pizzas: the cheapest pairing, and no pair is forced without a saving", () => {
  // Маргарита 30 ×2 (6.65) + Пеперони 30 ×2 (9.71): pairing the two
  // Пеперони saves 2.55; pairing the Маргарита (13.30) would cost MORE, so
  // they stay single — fewer pairs, lower total.
  const r = pizzaMathDiscount([L(30, 6.65, 2), L(30, 9.71, 2)]);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.discountEur, 2.55);
  assert.equal(pay([L(30, 6.65, 2), L(30, 9.71, 2)]), 13.3 + 16.87);
  // A mixed pair is chosen over two same-size pairs when that is cheaper.
  assert.equal(pay([L(30, 9.71, 2), L(40, 12.78, 2)]), 2 * 19.43);
});

test("FINAL RULE: Маргарита 30 + Кашкавалина 40 keeps its regular 16.88 € (the package would be dearer)", () => {
  assert.equal(COMBO_PRICING_MODE, "never_dearer");
  const pair = [L(30, 6.65), L(40, 10.23)];
  assert.equal(pay(pair), 16.88);
  assert.equal(pizzaMathDiscount(pair).pairs.length, 0, "no combo shown");
  assert.equal(pay(pair, "fixed"), 19.43, "only the unused fixed mode would charge the package");
});

test("other sizes, missing sizes and non-pizza categories never take part", () => {
  const none = (lines: PizzaMathLine[]) => pizzaMathDiscount(lines).discountCents;
  assert.equal(none([{ ...L(30, 9.71), variantName: "50 см" }, { ...L(30, 9.71), variantName: "50 см" }]), 0);
  assert.equal(none([{ ...L(30, 9.71), variantName: null }, { ...L(30, 9.71), variantName: null }]), 0);
  assert.equal(none([L(30, 9.71, 2, "cat_burgers")]), 0);
  assert.equal(none([L(30, 9.71, 2, "cat_sauces")]), 0);
});

test("the discount split over the lines adds up exactly — no cent lost or invented", () => {
  const rand = rng(7);
  for (let round = 0; round < 300; round++) {
    const lines: PizzaMathLine[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({
      key: `l${i}`,
      categoryId: "cat_pizzas_standard",
      variantName: rand() < 0.5 ? "30 см" : "40 см",
      baseUnitEur: Math.round((5 + rand() * 15) * 100) / 100,
      quantity: 1 + Math.floor(rand() * 3),
    }));
    for (const mode of ["never_dearer", "fixed"] as const) {
      const r = pizzaMathDiscount(lines, { mode });
      const sum = Object.values(r.lineDiscountsEur).reduce((s, v) => s + Math.round(v * 100), 0);
      assert.equal(sum, r.discountCents);
      if (mode === "never_dearer") assert.ok(r.pairs.every((p) => p.discountEur > 0));
    }
  }
});

// ── The server: menu prices and categories only ─────────────────────────────

const pizza = (id: string, categoryId: string, p30: number, p40: number): Product => ({
  id,
  name: id === "p_marg" ? "Маргарита" : id === "p_pep" ? "Пеперони" : "Сьомга",
  slug: id,
  description: "",
  categoryId,
  priceEur: p30,
  imageUrl: "/x.svg",
  allergens: [],
  isAvailable: true,
  sortOrder: 0,
  variants: [
    { id: `${id}_30`, name: "30 см", priceEur: p30 },
    { id: `${id}_40`, name: "40 см", priceEur: p40 },
  ],
});
const MENU: Record<string, Product> = {
  p_marg: pizza("p_marg", "cat_pizzas_standard", 6.65, 10.23),
  p_pep: pizza("p_pep", "cat_pizzas_standard", 9.71, 12.78),
  p_salmon: pizza("p_salmon", "cat_pizzas_special", 11.76, 15.34),
  s_garlic: {
    id: "s_garlic",
    name: "Чеснов сос",
    slug: "s-garlic",
    description: "",
    categoryId: "cat_sauces",
    priceEur: 1.02,
    imageUrl: "/x.svg",
    allergens: [],
    isAvailable: true,
    sortOrder: 0,
  },
  d_cola: {
    id: "d_cola",
    name: "Кола",
    slug: "d-cola",
    description: "",
    categoryId: "cat_drinks",
    priceEur: 2.3,
    imageUrl: "/x.svg",
    allergens: [],
    isAvailable: true,
    sortOrder: 0,
  },
};
const CATS: Record<string, { name: string; sortOrder: number }> = {
  cat_pizzas_standard: { name: "Стандартни пици", sortOrder: 1 },
  cat_pizzas_special: { name: "Специални пици", sortOrder: 2 },
  cat_sauces: { name: "Сосове", sortOrder: 8 },
  cat_drinks: { name: "Напитки", sortOrder: 10 },
};
const serverDeps = {
  getProduct: async (id: string) => MENU[id] ?? null,
  getCategory: async (id: string) => CATS[id] ?? null,
};
const place = (items: unknown[]) =>
  placeOrder(
    {
      contact: CONTACT,
      itemsJson: JSON.stringify(items),
      paymentMethod: "cash_on_delivery",
      checkoutKey: key(),
      userId: null,
      consents: ALL_CONSENTS,
    },
    serverDeps
  );
const garlic = (quantity: number) => ({ key: "sauce:s_garlic", sourceProductId: "s_garlic", quantity });

test("server: combos + sauces with quantities + a drink; saved order, ticket and e-mail all agree", async () => {
  const r = await place([
    { productId: "d_cola", quantity: 1 }, //                                     2.30
    { productId: "p_pep", variantId: "p_pep_40", quantity: 2, extras: [garlic(2)] }, // (12.78 + 2.04) × 2 = 29.64
    { productId: "s_garlic", quantity: 1 }, //                                   1.02
    { productId: "p_salmon", variantId: "p_salmon_30", quantity: 1 }, //         11.76
  ]);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const order = await getOrderById(r.orderId);
  assert.ok(order?.items);
  if (!order?.items) return;
  // Standard 40 (12.78) ×2 and a SPECIAL 30 (11.76): the special does not
  // take part (40+30 with it would have saved 5.11). The two standard 40s
  // pair: 25.56 → 23.01 (−2.55). Sauces are never part of the combo.
  assert.equal(order.subtotalEur, 44.72);
  assert.equal(order.discountEur, 2.55);
  assert.equal(order.totalEur, 42.17);
  assert.equal(order.offer.length, 1);
  assert.equal(order.offer[0].sizes, "40+40");
  assert.deepEqual([...order.offer[0].pizzasBg].sort(), ["Пеперони 40 см", "Пеперони 40 см"]);
  const lineShare = order.items.reduce((s, i) => s + Math.round(i.discountEur * 100), 0);
  assert.equal(lineShare, 255, "the per-line shares add up to the discount");
  assert.equal(order.items.find((i) => i.productId === "p_salmon")?.discountEur, 0, "the special pays in full");
  assert.equal(order.items[1].categoryNameBg, "Стандартни пици", "category snapshot saved");

  const ticket = buildTicketText(order, defaultPrintTemplate("DELIVERY"));
  assert.match(ticket, /ОБЩО\s+42\.17 €/);
  assert.match(ticket, /-2\.55 €/);
  const mail = customerOrderAcceptedEmail({ ...order, items: order.items }, { phone: "064 801 999" });
  assert.match(mail.text, /Обща сума: 42\.17 €/);
  assert.match(mail.text, /Отстъпка „Грешна математика“: -2\.55 €/);
});

test("server: the order in which pizzas were added never changes the saved money", async () => {
  const lines = [
    { productId: "p_marg", variantId: "p_marg_30", quantity: 2 },
    { productId: "p_pep", variantId: "p_pep_40", quantity: 1 },
    { productId: "p_salmon", variantId: "p_salmon_40", quantity: 1 },
    { productId: "p_pep", variantId: "p_pep_30", quantity: 2, extras: [garlic(1)] },
    { productId: "d_cola", quantity: 1 },
  ];
  const seen = new Set<string>();
  for (const items of [lines, [...lines].reverse(), [lines[2], lines[4], lines[0], lines[3], lines[1]]]) {
    const r = await place(items);
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    const o = await getOrderById(r.orderId);
    seen.add(JSON.stringify([o?.subtotalEur, o?.discountEur, o?.totalEur, o?.offer.map((c) => c.sizes).sort()]));
  }
  assert.equal(seen.size, 1, [...seen].join(" | "));
  // Standard units: 30 ×2 Маргарита 6.65, 30 ×2 Пеперони 9.71, 40 Пеперони 12.78.
  // Best: 40+30 Пеперони (−3.06); the remaining Пеперони 30 + Маргарита 30
  // (16.36) would not save, so it is not paired. (The alternative 30+30
  // Пеперони −2.55 + 40 with Маргарита 30 = 19.43, equal, saves less.)
  // The special 40 pays its 15.34.
  const [sub, disc, total, sizes] = JSON.parse([...seen][0]);
  assert.equal(disc, 3.06);
  assert.equal(Math.round((sub - disc) * 100), Math.round(total * 100));
  assert.deepEqual(sizes, ["30+40"]);
});

test("server: a price, category, discount or total sent by the browser is refused, never used", async () => {
  for (const tampered of [
    { productId: "p_pep", variantId: "p_pep_30", quantity: 2, priceEur: 0.01 },
    { productId: "p_pep", variantId: "p_pep_30", quantity: 2, categoryId: "cat_drinks" },
    { productId: "p_pep", variantId: "p_pep_30", quantity: 2, discountEur: 99 },
    { productId: "p_pep", variantId: "p_pep_30", quantity: 2, totalEur: 1 },
  ]) {
    const r = await place([tampered]);
    assert.deepEqual(r, { ok: false, error: "CART_INVALID" }, JSON.stringify(tampered));
  }
  // An extra with a forged price field is refused too.
  const r = await place([
    { productId: "p_pep", variantId: "p_pep_30", quantity: 1, extras: [{ ...garlic(1), unitPriceEur: 0 }] },
  ]);
  assert.equal(r.ok, false);
});

test("server: rounding stays exact on long baskets (no float drift)", async () => {
  const r = await place([
    { productId: "p_pep", variantId: "p_pep_30", quantity: 7, extras: [garlic(3)] },
    { productId: "p_marg", variantId: "p_marg_40", quantity: 3 },
  ]);
  assert.ok(r.ok);
  if (!r.ok) return;
  const o = await getOrderById(r.orderId);
  // 7 × (9.71 + 3.06) + 3 × 10.23 = 89.39 + 30.69 = 120.08
  assert.equal(o?.subtotalEur, 120.08);
  assert.equal(Math.round((o!.subtotalEur - o!.discountEur) * 100), Math.round(o!.totalEur * 100));
});
