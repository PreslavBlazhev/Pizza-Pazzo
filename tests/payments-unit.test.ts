/**
 * Pure payment logic: money, configuration safety rules, status rules, i18n.
 * Run: npm run test:payments
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toMinorUnits, fromMinorUnits, formatMinor } from "@/lib/payments/money";
import { getPaymentConfig } from "@/lib/payments/config";
import { getEffectivePaymentConfig } from "@/lib/payments/providers";
import { getAppBaseUrl, getAppEnv, normalizeBaseUrl } from "@/lib/app-env";
import {
  collectInstructionBg,
  orderPaymentStatusFor,
  paymentBlocksStatusChange,
} from "@/lib/payments/status";
import { customerPaymentState } from "@/lib/payments/service";
import { mapSimulatorState, SIMULATOR_SESSION_TTL_MS } from "@/lib/payments/providers/simulator";
import { itemsSchema } from "@/lib/checkout/place-order";

// ── Money ────────────────────────────────────────────────────────────────

test("money: euros become exact integer cents, float noise included", () => {
  assert.equal(toMinorUnits(23.4), 2340);
  assert.equal(toMinorUnits(23.519999999999996), 2352); // SQLite REAL drift
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
  assert.equal(toMinorUnits("13.45"), 1345);
  assert.equal(toMinorUnits({ toString: () => "95.49" }), 9549); // Prisma Decimal
  assert.equal(toMinorUnits("10.005"), 1001); // half-up
  assert.equal(toMinorUnits(0), 0);
  assert.equal(fromMinorUnits(2340), 23.4);
  assert.equal(formatMinor(2340, "EUR"), "23,40 €");
});

test("money: unreadable or negative amounts are refused", () => {
  assert.throws(() => toMinorUnits(Number.NaN));
  assert.throws(() => toMinorUnits(Infinity));
  assert.throws(() => toMinorUnits(-1));
  assert.throws(() => toMinorUnits("abc"));
});

// ── Configuration: the rules that make accidents impossible ──────────────

const SIM = {
  CARD_PAYMENTS_ENABLED: "true",
  PAYMENT_PROVIDER: "simulator",
  PAYMENT_SIMULATOR_SECRET: "0123456789abcdef-secret",
  APP_BASE_URL: "https://staging.example.test",
} as unknown as NodeJS.ProcessEnv;

test("config: card payments are OFF by default", () => {
  const c = getPaymentConfig({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv);
  assert.equal(c.enabled, false);
});

test("config: the kill switch turns card payments off whatever else is set", () => {
  const c = getPaymentConfig({ ...SIM, APP_ENV: "staging", CARD_PAYMENTS_ENABLED: "false" });
  assert.equal(c.enabled, false);
});

test("config: the simulator runs on staging and development", () => {
  assert.equal(getPaymentConfig({ ...SIM, APP_ENV: "staging" }).enabled, true);
  assert.equal(getPaymentConfig({ ...SIM, APP_ENV: "development" }).enabled, true);
  assert.equal(getPaymentConfig({ ...SIM, APP_ENV: "staging" }).isTest, true);
});

test("config: the simulator can NEVER run in production", () => {
  const explicit = getPaymentConfig({ ...SIM, APP_ENV: "production" });
  assert.equal(explicit.enabled, false);
  // A production build with APP_ENV forgotten is treated as production too.
  const forgotten = getPaymentConfig({ ...SIM, NODE_ENV: "production" });
  assert.equal(forgotten.appEnv, "production");
  assert.equal(forgotten.enabled, false);
});

test("config: the simulator refuses to run without its signing secret", () => {
  const c = getPaymentConfig({ ...SIM, APP_ENV: "staging", PAYMENT_SIMULATOR_SECRET: "short" });
  assert.equal(c.enabled, false);
});

test("config: a bank sandbox cannot run in production, bank production only in production", () => {
  const bank = {
    CARD_PAYMENTS_ENABLED: "true",
    PAYMENT_PROVIDER: "bank",
    PAYMENT_CURRENCY: "EUR",
    APP_BASE_URL: "https://pizza.example.test",
  } as unknown as NodeJS.ProcessEnv;
  assert.ok(
    getPaymentConfig({ ...bank, APP_ENV: "production", PAYMENT_ENV: "sandbox" }).problems.some((p) =>
      p.includes("sandbox")
    )
  );
  assert.ok(
    getPaymentConfig({ ...bank, APP_ENV: "staging", PAYMENT_ENV: "production" }).problems.some((p) =>
      p.includes("APP_ENV=production")
    )
  );
});

test("config: a real provider's currency is never assumed, and must be EUR", () => {
  const bank = {
    CARD_PAYMENTS_ENABLED: "true",
    PAYMENT_PROVIDER: "bank",
    PAYMENT_ENV: "production",
    APP_ENV: "production",
    APP_BASE_URL: "https://pizza.example.test",
  } as unknown as NodeJS.ProcessEnv;
  assert.ok(getPaymentConfig(bank).problems.some((p) => p.includes("PAYMENT_CURRENCY")));
  assert.ok(
    getPaymentConfig({ ...bank, PAYMENT_CURRENCY: "BGN" }).problems.some((p) => p.includes("EUR"))
  );
});

test("config: HTTPS is required outside development", () => {
  const c = getPaymentConfig({ ...SIM, APP_ENV: "staging", APP_BASE_URL: "http://staging.example.test" });
  assert.equal(c.enabled, false);
});

test("config: the bank adapter stays off until it is really implemented", () => {
  const c = getEffectivePaymentConfig({
    CARD_PAYMENTS_ENABLED: "true",
    PAYMENT_PROVIDER: "bank",
    PAYMENT_ENV: "sandbox",
    PAYMENT_CURRENCY: "EUR",
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.test",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(c.enabled, false);
  assert.ok(c.problems.some((p) => p.includes("не е реализиран")));
});

test("base URL: one variable, normalised, NEXT_PUBLIC_SITE_URL as fallback", () => {
  assert.equal(normalizeBaseUrl("https://pizza.example.com/"), "https://pizza.example.com");
  assert.equal(normalizeBaseUrl("https://pizza.example.com/?a=1#x"), "https://pizza.example.com");
  assert.equal(normalizeBaseUrl("ftp://x"), "");
  assert.equal(normalizeBaseUrl("not a url"), "");
  assert.equal(
    getAppBaseUrl({ APP_BASE_URL: "https://new.example.com", NEXT_PUBLIC_SITE_URL: "https://old.example" } as unknown as NodeJS.ProcessEnv),
    "https://new.example.com"
  );
  assert.equal(
    getAppBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://old.example" } as unknown as NodeJS.ProcessEnv),
    "https://old.example"
  );
  assert.equal(getAppEnv({ APP_ENV: "Staging" } as unknown as NodeJS.ProcessEnv), "staging");
});

// ── Status rules ─────────────────────────────────────────────────────────

test("status: the kitchen may not accept an unconfirmed card order, only cancel it", () => {
  const unpaid = { paymentMethod: "CARD_ONLINE", paymentStatus: "AWAITING_PAYMENT", releasedToKitchenAt: null };
  assert.equal(paymentBlocksStatusChange(unpaid, "ACCEPTED"), true);
  assert.equal(paymentBlocksStatusChange(unpaid, "CANCELLED"), false);
  const paid = { paymentMethod: "CARD_ONLINE", paymentStatus: "PAID", releasedToKitchenAt: new Date() };
  assert.equal(paymentBlocksStatusChange(paid, "ACCEPTED"), false);
  const cash = { paymentMethod: "CASH_ON_DELIVERY", paymentStatus: "CASH_DUE", releasedToKitchenAt: new Date() };
  assert.equal(paymentBlocksStatusChange(cash, "ACCEPTED"), false);
});

test("status: the ticket tells the driver whether to collect money", () => {
  assert.match(collectInstructionBg("CARD_ONLINE", "PAID", "23,40 €"), /НЕ СЪБИРАЙ/);
  assert.match(collectInstructionBg("CASH_ON_DELIVERY", "CASH_DUE", "23,40 €"), /СЪБЕРИ 23,40 €/);
  assert.match(collectInstructionBg("CARD_ONLINE", "AWAITING_PAYMENT", "1 €"), /НЕ Е ПОТВЪРДЕНО/);
});

test("status: order payment status follows the attempt outcome", () => {
  assert.equal(orderPaymentStatusFor("PAID"), "PAID");
  assert.equal(orderPaymentStatusFor("FAILED"), "FAILED");
  assert.equal(orderPaymentStatusFor("ERROR"), "FAILED");
  assert.equal(orderPaymentStatusFor("CANCELLED"), "CANCELLED");
  assert.equal(orderPaymentStatusFor("EXPIRED"), "EXPIRED");
  assert.equal(orderPaymentStatusFor("REDIRECTED"), "AWAITING_PAYMENT");
});

test("status: what the customer sees never says paid unless the order is PAID", () => {
  const base = { paymentMethod: "CARD_ONLINE", orderStatus: "PENDING" };
  assert.equal(customerPaymentState({ ...base, paymentStatus: "AWAITING_PAYMENT", latestAttemptStatus: "REDIRECTED" }), "PENDING");
  assert.equal(customerPaymentState({ ...base, paymentStatus: "FAILED", latestAttemptStatus: "FAILED" }), "FAILED");
  assert.equal(customerPaymentState({ ...base, paymentStatus: "AWAITING_PAYMENT", latestAttemptStatus: null }), "NOT_STARTED");
  assert.equal(customerPaymentState({ ...base, paymentStatus: "PAID", latestAttemptStatus: "PAID" }), "PAID");
  assert.equal(
    customerPaymentState({ paymentMethod: "CASH_ON_DELIVERY", orderStatus: "PENDING", paymentStatus: "CASH_DUE", latestAttemptStatus: null }),
    "NOT_CARD"
  );
});

test("simulator: an untouched hosted page expires like a bank session", () => {
  const now = new Date();
  assert.equal(mapSimulatorState("OPEN", now, now), "PENDING");
  assert.equal(
    mapSimulatorState("OPEN", new Date(now.getTime() - SIMULATOR_SESSION_TTL_MS - 1000), now),
    "EXPIRED"
  );
  assert.equal(mapSimulatorState("DECLINED", now, now), "FAILED");
});

// ── The browser cannot set prices, fees or statuses ──────────────────────

test("cart payload: any price, fee or status field is rejected outright", () => {
  const ok = [{ productId: "p", variantId: "v", quantity: 1 }];
  assert.equal(itemsSchema.safeParse(ok).success, true);
  for (const extra of [
    { priceEur: 0.01 },
    { unitPriceEur: 0.01 },
    { totalPriceEur: 0.01 },
    { discount: 5 },
    { status: "PAID" },
  ]) {
    assert.equal(itemsSchema.safeParse([{ ...ok[0], ...extra }]).success, false, JSON.stringify(extra));
  }
  assert.equal(itemsSchema.safeParse([{ productId: "p", quantity: 0 }]).success, false);
  assert.equal(itemsSchema.safeParse([{ productId: "p", quantity: 1.5 }]).success, false);
});

// ── BG / EN ──────────────────────────────────────────────────────────────

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

test("i18n: every payment screen text exists in Bulgarian AND English", () => {
  const bg = JSON.parse(readFileSync("messages/bg.json", "utf8"));
  const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
  const bgKeys = flatten({ payment: bg.payment, checkout: bg.checkout });
  const enKeys = new Set(flatten({ payment: en.payment, checkout: en.checkout }));
  for (const k of bgKeys) assert.ok(enKeys.has(k), `missing EN key ${k}`);
  // Every error code the start route can produce has a message.
  for (const code of ["DISABLED", "BUSY", "PROVIDER_ERROR", "STORE_CLOSED", "NOT_FOUND", "NOT_CARD", "ALREADY_PAID", "ORDER_CANCELLED"]) {
    assert.ok(bg.payment.errors[code], `BG error ${code}`);
    assert.ok(en.payment.errors[code], `EN error ${code}`);
  }
  // The screens say different things in the two languages (no copy-paste).
  assert.notEqual(bg.payment.success.title, en.payment.success.title);
  assert.equal(bg.checkout.paymentCod, undefined, "the old cash-only label is gone");
});
