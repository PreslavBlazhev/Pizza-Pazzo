/**
 * UBB virtual-POS requirements — the parts that can be proven on the server
 * (docs/UBB-COMPLIANCE.md). Runs on a brand-new temp SQLite built by the real
 * migrations (tests/setup-env.mjs); nothing touches prisma/dev.db or Render.
 *
 *   UBB-16  explicit confirmations: refused one by one, and when present the
 *           order stores the accepted versions + server time
 *   UBB-06  the client cannot change what is owed
 *   UBB-08  the delivery area is enforced by the server
 *   UBB-07/14  production never offers the simulator to the public
 *   i18n    every refusal code has a Bulgarian and an English text
 *   legal   every document is versioned, anchored and linkable
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { placeOrder, type PlaceOrderInput } from "@/lib/checkout/place-order";
import {
  CHECKOUT_FIELD_ERRORS,
  CHECKOUT_FORM_ERRORS,
  CONSENT_FIELDS,
} from "@/lib/validators/checkout";
import { LEGAL_VERSIONS } from "@/content/legal/versions";
import { resolveDeliveryTown } from "@/lib/delivery-area";
import { effectiveCardDemoMode, simulatorPageAllowed } from "@/lib/payments/demo";
import { COMPANY, companyFor } from "@/content/legal/company";
import { termsDoc } from "@/content/legal/terms";
import { refundsDoc } from "@/content/legal/refunds";
import { privacyDoc } from "@/content/legal/privacy";
import { deliveryDoc } from "@/content/legal/delivery";
import { paymentDoc } from "@/content/legal/payment";
import { cookiesDoc } from "@/content/legal/cookies";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, deps, key } from "./helpers";

after(async () => {
  await db.$disconnect();
});

/** A process.env stand-in for the pure config helpers. */
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

function input(overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    contact: CONTACT,
    itemsJson: STANDARD_ITEMS,
    paymentMethod: "cash_on_delivery",
    checkoutKey: key(),
    userId: null,
    consents: ALL_CONSENTS,
    ...overrides,
  };
}

// ── UBB-16: the explicit confirmations ───────────────────────────────────

for (const missing of CONSENT_FIELDS) {
  test(`UBB-16: a direct call without ${missing} is refused and creates nothing`, async () => {
    const before = await db.order.count();
    const consents = { ...ALL_CONSENTS, [missing]: undefined };
    const r = await placeOrder(input({ consents }), deps);
    assert.equal(r.ok, false);
    assert.deepEqual(!r.ok && r.fieldErrors, { [missing]: "CONSENT_REQUIRED" });
    assert.equal(await db.order.count(), before);
  });
}

test("UBB-16: nothing ticked → all three refusals at once", async () => {
  const r = await placeOrder(input({ consents: {} }), deps);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys((!r.ok && r.fieldErrors) || {}).sort(), [...CONSENT_FIELDS].sort());
});

test("UBB-16: only a real tick counts — 'off', '', 'false', 0 and 'yes' are refused", async () => {
  for (const value of ["off", "", "false", 0, "yes", null]) {
    const r = await placeOrder(input({ consents: { ...ALL_CONSENTS, consentPrivacy: value } }), deps);
    assert.equal(r.ok, false, `value ${JSON.stringify(value)} must not count as ticked`);
  }
});

test("UBB-16: a valid order records the accepted versions and the server time — nothing else", async () => {
  const t0 = Date.now();
  const r = await placeOrder(input(), deps);
  assert.ok(r.ok);
  const row = await db.order.findUniqueOrThrow({ where: { orderNumber: r.orderNumber } });
  assert.equal(row.consentTermsVersion, LEGAL_VERSIONS.terms);
  assert.equal(row.consentRefundsVersion, LEGAL_VERSIONS.refunds);
  assert.equal(row.consentPrivacyVersion, LEGAL_VERSIONS.privacy);
  assert.ok(row.consentRecordedAt, "server time recorded");
  const at = row.consentRecordedAt!.getTime();
  assert.ok(at >= t0 - 1000 && at <= Date.now() + 1000, "recorded now, by the server");
});

test("UBB-16: a duplicate submission returns the first order, which carries the proof", async () => {
  const k = key();
  const first = await placeOrder(input({ checkoutKey: k }), deps);
  const again = await placeOrder(input({ checkoutKey: k }), deps);
  assert.ok(first.ok && again.ok);
  assert.equal(again.orderNumber, first.orderNumber);
  assert.equal(again.duplicate, true);
  assert.equal(await db.order.count({ where: { checkoutKey: k } }), 1);
});

// ── UBB-06: what is owed comes from the server ───────────────────────────

test("UBB-06: prices, totals, fees and currency sent by the client are rejected or ignored", async () => {
  const tampered = [
    [{ productId: "prod_test_pizza", variantId: "var_test_30", quantity: 1, priceEur: 0.01 }],
    [{ productId: "prod_test_pizza", variantId: "var_test_30", quantity: 1, totalPriceEur: 0.01 }],
    [{ productId: "prod_test_pizza", variantId: "var_test_30", quantity: 1, currency: "BGN" }],
    [{ productId: "prod_test_pizza", variantId: "var_test_30", quantity: 1, extras: [{ key: "sauce:x", sourceProductId: "x", quantity: 1, priceEur: 0 }] }],
    [{ productId: "prod_test_pizza", variantId: "var_nope", quantity: 1 }],
    [{ productId: "prod_test_pizza", variantId: "var_test_30", quantity: 0 }],
    [{ productId: "prod_test_pizza", variantId: "var_test_30", quantity: -3 }],
    [{ productId: "prod_test_gone", quantity: 1 }],
  ];
  for (const items of tampered) {
    const r = await placeOrder(input({ itemsJson: JSON.stringify(items) }), deps);
    assert.equal(r.ok, false, `tampered payload accepted: ${JSON.stringify(items)}`);
  }
});

test("UBB-06: the stored total is the menu price of the chosen variant × quantity", async () => {
  const items = [
    { productId: "prod_test_pizza", variantId: "var_test_40", quantity: 2 }, // 2 × 13.45
    { productId: "prod_test_drink", quantity: 3 }, // 3 × 1.10
  ];
  const r = await placeOrder(input({ itemsJson: JSON.stringify(items) }), deps);
  assert.ok(r.ok);
  const row = await db.order.findUniqueOrThrow({
    where: { orderNumber: r.orderNumber },
    include: { items: true },
  });
  assert.equal(Number(row.totalEur), 30.2);
  assert.equal(Number(row.subtotalEur), 30.2, "delivery is free: subtotal = total");
  const pizza = row.items.find((i) => i.variantId === "var_test_40")!;
  assert.equal(Number(pizza.unitPriceEur), 13.45);
  assert.equal(Number(pizza.totalPriceEur), 26.9);
});

// ── UBB-08: the delivery area is a server rule ───────────────────────────

test("UBB-08: an address outside Pleven is refused by the server", async () => {
  for (const city of ["София", "Варна", "Plovdiv", "", "Плевенско село"]) {
    const r = await placeOrder(input({ contact: { ...CONTACT, deliveryCity: city } }), deps);
    assert.equal(r.ok, false, `city "${city}" must be refused`);
    assert.equal(!r.ok && r.fieldErrors?.deliveryCity, "CITY_OUTSIDE_AREA");
  }
});

test("UBB-08: Pleven in any common spelling is accepted and stored canonically", async () => {
  assert.equal(resolveDeliveryTown("гр. Плевен"), "Плевен");
  assert.equal(resolveDeliveryTown(" PLEVEN "), "Плевен");
  assert.equal(resolveDeliveryTown("град Плевен"), "Плевен");
  const r = await placeOrder(input({ contact: { ...CONTACT, deliveryCity: "Pleven" } }), deps);
  assert.ok(r.ok);
  const row = await db.order.findUniqueOrThrow({ where: { orderNumber: r.orderNumber } });
  assert.equal(row.deliveryCity, "Плевен");
});

// ── UBB-07 / UBB-14: the simulator is never public in production ─────────

test("UBB-07: production reads a stored EVERYONE as STAFF; staging keeps it", () => {
  assert.equal(effectiveCardDemoMode("EVERYONE", env({ APP_ENV: "production" })), "STAFF");
  assert.equal(effectiveCardDemoMode("EVERYONE", env({ NODE_ENV: "production" })), "STAFF", "missing APP_ENV on a prod build = production");
  assert.equal(effectiveCardDemoMode("STAFF", env({ APP_ENV: "production" })), "STAFF");
  assert.equal(effectiveCardDemoMode("OFF", env({ APP_ENV: "production" })), "OFF");
  assert.equal(effectiveCardDemoMode("EVERYONE", env({ APP_ENV: "staging" })), "EVERYONE");
});

test("UBB-07: in production only staff may open/decide the simulator page", () => {
  const prod = env({ APP_ENV: "production" });
  assert.equal(simulatorPageAllowed(null, prod), false, "guest");
  assert.equal(simulatorPageAllowed("CUSTOMER", prod), false, "customer");
  assert.equal(simulatorPageAllowed("STAFF", prod), true);
  assert.equal(simulatorPageAllowed("SUPER_ADMIN", prod), true);
  assert.equal(simulatorPageAllowed(null, env({ APP_ENV: "staging" })), true, "staging demo stays open");
});

// ── i18n: every refusal can be said in both languages ────────────────────

test("every checkout refusal code has a Bulgarian and an English message", () => {
  for (const locale of ["bg", "en"]) {
    const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"));
    for (const code of [...CHECKOUT_FIELD_ERRORS, ...CHECKOUT_FORM_ERRORS]) {
      const text = messages.checkout.errors[code];
      assert.ok(typeof text === "string" && text.length > 3, `${locale}: checkout.errors.${code}`);
    }
  }
});

// ── UBB-02: one merchant identity, as registered ─────────────────────────

test("UBB-02: the merchant identity matches the Commercial Register / VIES record", () => {
  assert.equal(COMPANY.uic, "203300275");
  assert.equal(COMPANY.vatNumber, "BG203300275");
  assert.equal(companyFor("bg").legalName, "„ПИЦА ПАЦО“ ЕООД");
  assert.equal(companyFor("en").legalName, "PIZZA PAZZO LTD");
  assert.match(companyFor("bg").registeredAddress, /Димитър Константинов“ № 37, ет\. 4, ап\. 5/);
  // UBB-15: exactly the BFSA register entry (public-iisr.bfsa.bg, register 4-2).
  assert.deepEqual(COMPANY.foodRegistration && {
    number: COMPANY.foodRegistration.number,
    certificate: COMPANY.foodRegistration.certificate,
  }, { number: "152700478", certificate: "101-7892/16.04.2015" });
});

// ── Legal documents: versioned, anchored, linkable ───────────────────────

const DOCS = [termsDoc, refundsDoc, privacyDoc, deliveryDoc, paymentDoc, cookiesDoc];

test("every legal document carries the version orders store, and unique anchors", () => {
  for (const doc of DOCS) {
    const expected = LEGAL_VERSIONS[doc.slug === "payment" ? "payment" : (doc.slug as keyof typeof LEGAL_VERSIONS)];
    assert.equal(doc.version, expected, `${doc.slug} version`);
    const ids = doc.sections.map((s) => s.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${doc.slug}: duplicate section ids`);
    for (const s of doc.sections) {
      assert.ok(s.heading.bg && s.heading.en, `${doc.slug}: heading in both languages`);
      for (const b of s.blocks) {
        if ("p" in b) assert.ok(b.p.bg && b.p.en, `${doc.slug}/${s.id}: paragraph in both languages`);
        if ("list" in b) for (const li of b.list) assert.ok(li.bg && li.en, `${doc.slug}/${s.id}: list item in both languages`);
      }
    }
  }
});

test("every linked legal route exists as a page", () => {
  for (const route of ["terms", "refunds", "privacy", "delivery", "payment-methods", "cookies", "contacts"]) {
    assert.ok(existsSync(join(process.cwd(), "app", "[locale]", route, "page.tsx")), `/${route}`);
  }
});

test("the texts never promise what the code does not do", () => {
  const all = JSON.stringify(DOCS);
  assert.ok(!/ec\.europa\.eu\/consumers\/odr/.test(all), "the EU ODR platform closed on 20.07.2025");
  assert.ok(!/лв\.|BGN/.test(all), "the euro is the only currency");
  assert.ok(!/Apple Pay|Google Pay/.test(all.replace(/не предлагаме плащане с Apple Pay, Google Pay|do not save cards, make recurring or subscription payments, or offer Apple Pay, Google Pay/g, "")), "no wallet is offered");
  assert.ok(!/14 дни.{0,40}пиц/i.test(all), "no 14-day return for pizza");
  // An unconfirmed payment is a transaction to CHECK, not proof that nothing
  // was taken — neither the documents nor the payment pages may say otherwise.
  const ui = readFileSync(join(process.cwd(), "messages", "bg.json"), "utf8") + readFileSync(join(process.cwd(), "messages", "en.json"), "utf8");
  for (const claim of [/сума не се удържа/, /нищо не (ви )?се удържа/, /nothing is charged/i, /няма да бъдете таксувани/, /will not be charged twice/i, /няма какво да бъде възстановено/, /nothing to refund/i]) {
    assert.ok(!claim.test(all) && !claim.test(ui), `unproven "not charged" claim: ${claim}`);
  }
  assert.ok(/проверяваме транзакцията/.test(all) && /check the transaction/.test(all), "the documents say the transaction is checked");
});
