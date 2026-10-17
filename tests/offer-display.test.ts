/**
 * B (presentation). With FIXED package prices a combo can be dearer than the
 * pizzas' regular prices (Маргарита 30 + Кашкавалина 40: 16.88 € regular,
 * 19.43 € package). Every real consumer must show that as "Разлика до
 * пакетната цена +2.55 €" next to the combo's package and regular price —
 * never as a negative discount, never with a double minus — and must still
 * add up to the total. Tested through the components and templates that
 * customers and staff actually see, not only through the arithmetic.
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

const pizza = (id: string, name: string, p30: number, p40: number): Product => ({
  id,
  name,
  slug: id,
  description: "",
  categoryId: "cat_pizzas_standard",
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
};
const deps = {
  getProduct: async (id: string) => MENU[id] ?? null,
  getCategory: async () => ({ name: "Стандартни пици", sortOrder: 1 }),
};

const cartLine = (id: string, size: 30 | 40): CartItem => {
  const product = MENU[id];
  const variant = product.variants!.find((v) => v.name.startsWith(String(size)))!;
  return { lineId: `${id}::${variant.id}`, product, selectedVariant: variant, extras: [], quantity: 1, unitPrice: variant.priceEur };
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

test("the active mode is FIXED package prices (current brief)", () => {
  assert.equal(COMBO_PRICING_MODE, "fixed");
});

test("the presenter turns the signed difference into a discount or a difference, never a negative discount", () => {
  const f = (n: number) => `${n.toFixed(2)} €`;
  assert.deepEqual(offerAdjustment(2.55), { kind: "discount", amountEur: 2.55 });
  assert.deepEqual(offerAdjustment(-2.55), { kind: "surcharge", amountEur: 2.55 });
  assert.deepEqual(offerAdjustment(0), { kind: "none", amountEur: 0 });
  assert.equal(signedAdjustment(offerAdjustment(2.55), f), "−2.55 €");
  assert.equal(signedAdjustment(offerAdjustment(-2.55), f), "+2.55 €");
  assert.equal(signedAdjustment(offerAdjustment(-2.55), f, "-"), "+2.55 €");
});

test("basket/checkout (CartSummary): a DEARER package shows the package, the regular price and '+2.55 €'", () => {
  const html = renderSummary([cartLine("marg", 30), cartLine("kash", 40)]);
  assert.ok(html.includes("Оферта 2 пици 40 + 30 см (редовно 16.88 €)"), html);
  assert.ok(html.includes("19.43 €"));
  assert.ok(html.includes("Разлика до пакетната цена"));
  assert.ok(html.includes('data-testid="cart-surcharge">+2.55 €'));
  assert.ok(html.includes('data-testid="cart-total">19.43 €'));
  assert.ok(!html.includes("Отстъпка"), "no 'discount' label for a dearer package");
  assertNoNegativeDiscount(html, "CartSummary");
  // The combo is shown even though totals.discount is not > 0 (it was hidden before).
  assert.ok(html.includes('data-testid="cart-combo"'));
  const enHtml = renderSummary([cartLine("marg", 30), cartLine("kash", 40)], "en");
  assert.ok(enHtml.includes("2-pizza offer 40 + 30 cm (regular 16.88 €)"));
  assert.ok(enHtml.includes("Difference to the package price"));
});

test("basket: a CHEAPER package shows a real discount with one minus; an equal one shows no money line", () => {
  const html = renderSummary([cartLine("pep", 40), cartLine("pep", 30)]);
  assert.ok(html.includes("Отстъпка „Грешна математика“"));
  assert.ok(html.includes('data-testid="cart-discount">−3.06 €'));
  assert.ok(html.includes('data-testid="cart-total">19.43 €'));
  assertNoNegativeDiscount(html, "CartSummary (discount)");
  // Маргарита 30 (6.65) + Пеперони 40 (12.78) = 19.43 exactly: combo shown, no money line.
  const even = renderSummary([cartLine("marg", 30), cartLine("pep", 40)]);
  assert.ok(even.includes('data-testid="cart-combo"'));
  assert.ok(!even.includes("cart-discount") && !even.includes("cart-surcharge"));
  // One pizza: the hint, no combo.
  assert.ok(renderSummary([cartLine("pep", 30)]).includes('data-testid="pizza-math-hint"'));
});

test("server → saved order → customer e-mail, restaurant e-mail, ticket and Android job all agree", async () => {
  const r = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: JSON.stringify([
        { productId: "marg", variantId: "marg_30", quantity: 1 },
        { productId: "kash", variantId: "kash_40", quantity: 1 },
      ]),
      paymentMethod: "cash_on_delivery",
      checkoutKey: key(),
      userId: null,
      consents: ALL_CONSENTS,
    },
    deps
  );
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const order = (await getOrderById(r.orderId)) as OrderWithItems;
  assert.equal(order.subtotalEur, 16.88);
  assert.equal(order.discountEur, -2.55, "stored as a signed difference");
  assert.equal(order.totalEur, 19.43, "the fixed package price is what is charged");
  assert.equal(order.offer[0].regularEur, 16.88);
  // The basket said the same.
  assert.equal(cartTotals([cartLine("marg", 30), cartLine("kash", 40)]).total, order.totalEur);

  // Customer e-mail (text + HTML).
  const mail = customerOrderAcceptedEmail(order, { phone: "064 801 999" });
  for (const [part, where] of [
    [mail.text, "customer text"],
    [mail.html, "customer html"],
  ] as const) {
    assert.ok(part.includes("Оферта 2 пици 40 + 30 см: 19.43 € (редовно 16.88 €)"), where);
    assert.ok(part.includes("Разлика до пакетната цена"), where);
    assert.ok(part.includes("+2.55 €"), where);
    assert.ok(!part.includes("Отстъпка"), `${where}: no discount label`);
    assertNoNegativeDiscount(part, where);
  }
  assert.ok(mail.text.includes("Обща сума: 19.43 €"));

  // Restaurant e-mail — through the real builder the notifier uses.
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
  for (const part of [kitchenMail.text, kitchenMail.html]) {
    assert.ok(part.includes("Разлика до пакетната цена: +2.55 €"));
    assert.ok(part.includes("(редовно 16.88 €)"));
    assertNoNegativeDiscount(part, "restaurant e-mail");
  }

  // Web ticket.
  const ticket = buildTicketText(order, defaultPrintTemplate("DELIVERY"));
  assert.match(ticket, /Оферта 2 пици 40 \+ 30 см \(редовно\s+16\.88 €\)\s+19\.43 €|Оферта 2 пици 40 \+ 30 см \(редовно 16\.88 €\)/);
  assert.match(ticket, /Разлика до пакетната цена\s+\+2\.55 €/);
  assert.match(ticket, /ОБЩО\s+19\.43 €/);
  assertNoNegativeDiscount(ticket, "ticket");

  // Android job: no negative `discount`; the difference is its own line, so
  // the printed lines add up to the total.
  const job = JSON.parse(buildPrintableOrderJson(order, { template: defaultPrintTemplate("DELIVERY") }));
  assert.equal(job.discount, 0);
  const last = job.items.at(-1);
  assert.equal(last.section, "offer");
  assert.equal(last.totalPrice, 2.55);
  assert.match(last.name, /^Разлика до пакетната цена \(40 \+ 30 см\)$/);
  const sum = job.items.reduce((s: number, i: { totalPrice: number }) => s + Math.round(i.totalPrice * 100), 0);
  assert.equal(sum - Math.round(job.discount * 100), Math.round(job.total * 100));
  assertNoNegativeDiscount(JSON.stringify(job), "android job");
});

test("a CHEAPER package on the ticket and in the Android job: one discount line with one minus", async () => {
  const r = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: JSON.stringify([
        { productId: "pep", variantId: "pep_40", quantity: 1 },
        { productId: "pep", variantId: "pep_30", quantity: 1 },
      ]),
      paymentMethod: "cash_on_delivery",
      checkoutKey: key(),
      userId: null,
      consents: ALL_CONSENTS,
    },
    deps
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  const order = (await getOrderById(r.orderId)) as OrderWithItems;
  assert.equal(order.discountEur, 3.06);
  const ticket = buildTicketText(order, defaultPrintTemplate("DELIVERY"));
  assert.match(ticket, /Отстъпка „Грешна математика“\s+-3\.06 €/);
  assertNoNegativeDiscount(ticket, "ticket (discount)");
  const job = JSON.parse(buildPrintableOrderJson(order));
  assert.equal(job.discount, 3.06);
  assert.ok(!job.items.some((i: { section: string }) => i.section === "offer"));
  const mail = customerOrderAcceptedEmail(order, { phone: "064" });
  assert.ok(mail.text.includes("Отстъпка „Грешна математика“: -3.06 €"));
  assertNoNegativeDiscount(mail.text, "customer text (discount)");
});
