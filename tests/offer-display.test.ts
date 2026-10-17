/**
 * B (presentation) — the FINAL rule (owner, 2026-10-17): a combo exists only
 * for two STANDARD pizzas whose regular base prices are strictly above the
 * package price. So every real consumer must:
 *   - show NOTHING about a package when the pair would not save (Маргарита
 *     30 + Кашкавалина 40: 16.88 € regular stays 16.88 €) — no combo line, no
 *     "discount", no "difference";
 *   - leave special pizzas out of every combo, and show no package promise
 *     for a basket of special pizzas only;
 *   - show a real saving as one discount line with one minus, next to the
 *     combo's package and regular price;
 *   - add up to the same total in the basket, the saved order, both e-mails,
 *     the web ticket and the Android job.
 * Tested through the components and templates that customers and staff
 * actually see, not only through the arithmetic.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import bg from "@/messages/bg.json";
import en from "@/messages/en.json";
import { db } from "@/lib/db";
import { COMBO_PRICING_MODE } from "@/lib/pizza-math";
import { offerAdjustment, signedAdjustment } from "@/lib/offer-display";
import { cartTotals } from "@/lib/cart-totals";
import { CartSummary } from "@/components/cart/CartSummary";
import { placeOrder } from "@/lib/checkout/place-order";
import { getOrderById } from "@/lib/orders";
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import { newOrderEmail, type NewOrderEmailData } from "@/lib/email-templates/new-order";
import { notifyRestaurantOnce } from "@/lib/payments/service";
import { buildTicketText } from "@/lib/printer/ticket-template";
import { buildPrintableOrderJson } from "@/lib/android-printer";
import { defaultPrintTemplate } from "@/types/print";
import type { CartItem } from "@/types/cart";
import type { Product } from "@/types/product";
import type { OrderWithItems } from "@/types/order";
import { ALL_CONSENTS, CONTACT, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

const STD = "cat_pizzas_standard";
const SPECIAL = "cat_pizzas_special";
const pizza = (id: string, name: string, p30: number, p40: number, categoryId = STD): Product => ({
  id,
  name,
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
  marg: pizza("marg", "Маргарита", 6.65, 10.23),
  kash: pizza("kash", "Кашкавалина", 6.65, 10.23),
  pep: pizza("pep", "Пеперони Макс", 9.71, 12.78),
  salmon: pizza("salmon", "Сьомга", 11.76, 15.34, SPECIAL),
  prosh: pizza("prosh", "Прошуто", 11.76, 15.34, SPECIAL),
};
const CATS: Record<string, { name: string; sortOrder: number }> = {
  [STD]: { name: "Стандартни пици", sortOrder: 1 },
  [SPECIAL]: { name: "Специални пици", sortOrder: 2 },
};
const deps = {
  getProduct: async (id: string) => MENU[id] ?? null,
  getCategory: async (id: string) => CATS[id] ?? null,
};

const cartLine = (id: string, size: 30 | 40, quantity = 1): CartItem => {
  const product = MENU[id];
  const variant = product.variants!.find((v) => v.name.startsWith(String(size)))!;
  return { lineId: `${id}::${variant.id}`, product, selectedVariant: variant, extras: [], quantity, unitPrice: variant.priceEur };
};

function renderSummary(items: CartItem[], locale: "bg" | "en" = "bg"): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale, messages: locale === "bg" ? bg : en, timeZone: "Europe/Sofia" } as ComponentProps<
        typeof NextIntlClientProvider
      >,
      createElement(CartSummary, { totals: cartTotals(items) })
    )
  );
}

/** No negative "discount" anywhere, and no double minus in any form. */
function assertNoNegativeDiscount(raw: string, where: string) {
  // A ticket's "-----" divider lines are not amounts.
  const text = raw
    .split("\n")
    .filter((l) => !/^\s*-{4,}\s*$/.test(l))
    .join("\n");
  for (const bad of ["--", "−−", "-−", "−-", "+-", "+−"]) {
    assert.ok(!text.includes(bad), `${where} contains "${bad}"`);
  }
  assert.ok(!/Отстъпка[^\n<]*\+/.test(text), `${where} shows a positive amount labelled as a discount`);
}

/** Nothing about a package, discount or difference. */
function assertNoOffer(raw: string, where: string) {
  for (const word of ["Оферта", "Отстъпка", "Грешна математика", "Разлика до пакетната цена", "редовно"]) {
    assert.ok(!raw.includes(word), `${where} mentions "${word}"`);
  }
}

async function place(items: { productId: string; variantId: string; quantity: number }[]): Promise<OrderWithItems> {
  const r = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: JSON.stringify(items),
      paymentMethod: "cash_on_delivery",
      checkoutKey: key(),
      userId: null,
      consents: ALL_CONSENTS,
    },
    deps
  );
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) throw new Error("refused");
  return (await getOrderById(r.orderId)) as OrderWithItems;
}

/** Every surface built from the saved order: customer + restaurant e-mail, ticket, Android job. */
async function surfaces(order: OrderWithItems) {
  const mail = customerOrderAcceptedEmail(order, { phone: "064 801 999" });
  await db.order.update({
    where: { id: order.id },
    data: { notificationStatus: null, notificationSentAt: null, notificationAttempts: 0, notificationClaimedAt: null },
  });
  let captured: NewOrderEmailData | null = null;
  await notifyRestaurantOnce(order.id, async (data) => {
    captured = data;
    return { status: "sent" };
  });
  assert.ok(captured, "the notifier built the e-mail data");
  const kitchenMail = newOrderEmail(captured!);
  const ticket = buildTicketText(order, defaultPrintTemplate("DELIVERY"));
  const job = JSON.parse(buildPrintableOrderJson(order, { template: defaultPrintTemplate("DELIVERY") }));
  return { mail, kitchenMail, ticket, job };
}

function assertJobAddsUp(job: { items: { totalPrice: number }[]; discount: number; total: number }) {
  const sum = job.items.reduce((s, i) => s + Math.round(i.totalPrice * 100), 0);
  assert.equal(sum - Math.round(job.discount * 100), Math.round(job.total * 100), "Android lines add up to the total");
}

test("the active mode is never_dearer (final rule)", () => {
  assert.equal(COMBO_PRICING_MODE, "never_dearer");
});

test("the presenter: a discount has one minus; any other stored value is never shown as a negative discount", () => {
  const f = (n: number) => `${n.toFixed(2)} €`;
  assert.deepEqual(offerAdjustment(2.55), { kind: "discount", amountEur: 2.55 });
  assert.deepEqual(offerAdjustment(0), { kind: "none", amountEur: 0 });
  assert.equal(signedAdjustment(offerAdjustment(2.55), f), "−2.55 €");
  // Defensive only (the active rule never stores a negative difference).
  assert.deepEqual(offerAdjustment(-2.55), { kind: "surcharge", amountEur: 2.55 });
  assert.equal(signedAdjustment(offerAdjustment(-2.55), f, "-"), "+2.55 €");
});

test("basket/checkout: a pair that would NOT save shows no combo, no discount and its regular total", () => {
  for (const [items, total] of [
    [[cartLine("marg", 30), cartLine("kash", 40)], "16.88 €"], // below 19.43
    [[cartLine("marg", 30), cartLine("pep", 40)], "19.43 €"], // exactly 19.43
    [[cartLine("marg", 40, 2)], "20.46 €"], // below 23.01
  ] as const) {
    for (const locale of ["bg", "en"] as const) {
      const html = renderSummary([...items], locale);
      assert.ok(!html.includes('data-testid="cart-combo"'), `${locale}: no combo`);
      assert.ok(!html.includes("cart-discount") && !html.includes("cart-surcharge"), `${locale}: no money line`);
      assert.ok(html.includes(`data-testid="cart-total">${total}`), `${locale}: ${total}`);
      assert.ok(!html.includes("Разлика до пакетната цена") && !html.includes("Difference to the package price"));
      assertNoNegativeDiscount(html, "CartSummary");
    }
  }
});

test("basket: a CHEAPER pair shows the package, the regular price and one discount line with one minus", () => {
  const html = renderSummary([cartLine("pep", 40), cartLine("pep", 30)]);
  assert.ok(html.includes("Оферта 2 пици 40 + 30 см (редовно 22.49 €)"), html);
  assert.ok(html.includes("Отстъпка „Грешна математика“"));
  assert.ok(html.includes('data-testid="cart-discount">−3.06 €'));
  assert.ok(html.includes('data-testid="cart-total">19.43 €'));
  assertNoNegativeDiscount(html, "CartSummary (discount)");
  const enHtml = renderSummary([cartLine("pep", 40), cartLine("pep", 30)], "en");
  assert.ok(enHtml.includes("2-pizza offer 40 + 30 cm (regular 22.49 €)"));
  assert.ok(enHtml.includes('data-testid="cart-discount">−3.06 €'));
});

test("basket: special pizzas — no combo with them, and no package promise for a basket of specials only", () => {
  // Specials only: no combo, and NOT the hint (it would promise a discount).
  for (const items of [[cartLine("salmon", 30), cartLine("prosh", 30)], [cartLine("salmon", 40, 2)]]) {
    for (const locale of ["bg", "en"] as const) {
      const html = renderSummary(items, locale);
      assert.ok(!html.includes('data-testid="cart-combo"'));
      assert.ok(!html.includes('data-testid="pizza-math-hint"'), `${locale}: no hint for specials only`);
      assert.ok(!html.includes("cart-discount"));
    }
  }
  // Special + standard: no combo; the standard pizza alone may get the hint.
  const mixed = renderSummary([cartLine("salmon", 30), cartLine("pep", 30)]);
  assert.ok(!mixed.includes('data-testid="cart-combo"'));
  assert.ok(mixed.includes('data-testid="cart-total">21.47 €'));
  // Two standard + specials: exactly the standard pair.
  const both = renderSummary([cartLine("salmon", 40), cartLine("pep", 30, 2), cartLine("prosh", 30)]);
  assert.equal(both.split('data-testid="cart-combo"').length - 1, 1);
  assert.ok(both.includes("Оферта 2 пици 30 + 30 см (редовно 19.42 €)"));
  assert.ok(both.includes('data-testid="cart-discount">−2.55 €'));
  // One standard pizza: the hint, which now names the rule.
  const one = renderSummary([cartLine("pep", 30)]);
  assert.ok(one.includes('data-testid="pizza-math-hint"'));
  assert.ok(one.includes("стандартни пици") && one.includes("Специалните пици не участват"));
});

test("server → saved order → both e-mails, ticket and Android job: a pair that would not save shows NO offer anywhere", async () => {
  const order = await place([
    { productId: "marg", variantId: "marg_30", quantity: 1 },
    { productId: "kash", variantId: "kash_40", quantity: 1 },
  ]);
  assert.equal(order.subtotalEur, 16.88);
  assert.equal(order.discountEur, 0);
  assert.equal(order.totalEur, 16.88, "never dearer: the regular price is charged");
  assert.deepEqual(order.offer, []);
  assert.ok(order.items.every((i) => i.discountEur === 0));
  assert.equal(cartTotals([cartLine("marg", 30), cartLine("kash", 40)]).total, order.totalEur, "basket = server");

  const { mail, kitchenMail, ticket, job } = await surfaces(order);
  for (const [part, where] of [
    [mail.text, "customer text"],
    [mail.html, "customer html"],
    [kitchenMail.text, "restaurant text"],
    [kitchenMail.html, "restaurant html"],
    [ticket, "ticket"],
    [JSON.stringify(job), "android job"],
  ] as const) {
    assertNoOffer(part, where);
    assertNoNegativeDiscount(part, where);
  }
  assert.ok(mail.text.includes("Обща сума: 16.88 €"));
  assert.ok(kitchenMail.text.includes("Общо: 16.88 €"));
  assert.match(ticket, /ОБЩО\s+16\.88 €/);
  assert.equal(job.discount, 0);
  assert.equal(job.total, 16.88);
  assert.ok(!job.items.some((i: { section: string }) => i.section === "offer"));
  assertJobAddsUp(job);
});

test("server → every surface: two standard + a special — the same saving and the same total everywhere", async () => {
  const items = [
    { productId: "salmon", variantId: "salmon_30", quantity: 1 },
    { productId: "pep", variantId: "pep_40", quantity: 1 },
    { productId: "pep", variantId: "pep_30", quantity: 1 },
  ];
  const order = await place(items);
  // 11.76 + 12.78 + 9.71 = 34.25; only the standard 40 + 30 pair (22.49 → 19.43).
  assert.equal(order.subtotalEur, 34.25);
  assert.equal(order.discountEur, 3.06);
  assert.equal(order.totalEur, 31.19);
  assert.equal(order.offer.length, 1);
  assert.deepEqual([...order.offer[0].pizzasBg].sort(), ["Пеперони Макс 30 см", "Пеперони Макс 40 см"]);
  assert.equal(order.items.find((i) => i.productId === "salmon")?.discountEur, 0, "the special pays in full");
  const preview = cartTotals([cartLine("salmon", 30), cartLine("pep", 40), cartLine("pep", 30)]);
  assert.deepEqual([preview.subtotal, preview.discount, preview.total], [34.25, 3.06, 31.19], "basket = server");

  const { mail, kitchenMail, ticket, job } = await surfaces(order);
  for (const [part, where] of [
    [mail.text, "customer text"],
    [mail.html, "customer html"],
    [kitchenMail.text, "restaurant text"],
    [kitchenMail.html, "restaurant html"],
  ] as const) {
    assert.ok(part.includes("Оферта 2 пици 40 + 30 см: 19.43 € (редовно 22.49 €)"), where);
    if (where === "customer html") {
      // The HTML table puts the label and the amount in two cells.
      assert.ok(part.includes("Отстъпка „Грешна математика“") && part.includes("-3.06 €"), where);
    } else {
      assert.ok(part.includes("Отстъпка „Грешна математика“: -3.06 €"), where);
    }
    assert.ok(!part.includes("Разлика до пакетната цена"), where);
    assertNoNegativeDiscount(part, where);
  }
  assert.ok(mail.text.includes("Обща сума: 31.19 €"));
  assert.ok(kitchenMail.text.includes("Общо: 31.19 €"));
  assert.match(ticket, /Отстъпка „Грешна математика“\s+-3\.06 €/);
  assert.match(ticket, /ОБЩО\s+31\.19 €/);
  assert.ok(!ticket.includes("Разлика до пакетната цена"));
  assertNoNegativeDiscount(ticket, "ticket");
  assert.equal(job.discount, 3.06);
  assert.equal(job.total, 31.19);
  assert.ok(!job.items.some((i: { section: string }) => i.section === "offer"));
  assertJobAddsUp(job);
});

test("server: special + special and special + standard save NOTHING on every surface", async () => {
  for (const [items, total] of [
    [[{ productId: "salmon", variantId: "salmon_40", quantity: 1 }, { productId: "prosh", variantId: "prosh_40", quantity: 1 }], 30.68],
    [[{ productId: "salmon", variantId: "salmon_30", quantity: 2 }], 23.52],
    [[{ productId: "prosh", variantId: "prosh_30", quantity: 1 }, { productId: "pep", variantId: "pep_40", quantity: 1 }], 24.54],
  ] as const) {
    const order = await place([...items]);
    assert.equal(order.discountEur, 0);
    assert.equal(order.totalEur, total);
    assert.deepEqual(order.offer, []);
    const { mail, kitchenMail, ticket, job } = await surfaces(order);
    for (const part of [mail.text, mail.html, kitchenMail.text, kitchenMail.html, ticket, JSON.stringify(job)]) {
      assertNoOffer(part, `specials ${total}`);
    }
    assert.equal(job.total, total);
    assertJobAddsUp(job);
  }
});
