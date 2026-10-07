/**
 * The whole card-payment flow against a real (temporary) SQLite database,
 * with the payment simulator standing in for the bank.
 *
 * ⚠️ These tests prove OUR side: pricing, statuses, idempotency, the kitchen
 * gate. They are NOT a bank test — see docs/online-card-payments.md.
 *
 * Run: npm run test:payments
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { placeOrder } from "@/lib/checkout/place-order";
import {
  applyProviderStatus,
  MAX_NOTIFICATION_ATTEMPTS,
  notifyRestaurantOnce,
  retryFailedNotifications,
  handleProviderCallback,
  refreshOrderPayment,
  startCardPayment,
  syncAttempt,
} from "@/lib/payments/service";
import {
  recordSimulatorOutcome,
  signSimulatorBody,
  SIMULATOR_SIGNATURE_HEADER,
  type SimulatorScenario,
} from "@/lib/payments/providers/simulator";
import { getCustomerPaymentView } from "@/lib/payments/customer";
import { getEffectivePaymentConfig, resolveCheckoutPayment } from "@/lib/payments/providers";
import { getPendingOrders } from "@/lib/orders";
import { getAdminReport } from "@/lib/reports";
import { resolvePresetRange } from "@/lib/report-period";
import {
  ALL_CONSENTS,
  CONTACT,
  STANDARD_ITEMS,
  STANDARD_TOTAL_MINOR,
  captureNotificationLog,
  deps,
  key,
  order,
  quiet,
} from "./helpers";

after(async () => {
  await db.$disconnect();
});

async function orderRow(orderNumber: number) {
  return db.order.findUniqueOrThrow({ where: { orderNumber } });
}

async function notificationAttempts(orderNumber: number): Promise<number> {
  return (await orderRow(orderNumber)).notificationAttempts;
}

async function kitchenNumbers(): Promise<number[]> {
  return (await getPendingOrders()).map((o) => o.orderNumber);
}

/** Starts a payment and plays the bank's answer on the simulator page. */
async function payWith(token: string, scenario: SimulatorScenario) {
  const start = await startCardPayment({ accessToken: token, locale: "bg" });
  assert.equal(start.ok, true, JSON.stringify(start));
  const attempt = await db.paymentAttempt.findFirstOrThrow({
    where: { order: { accessToken: token } },
    orderBy: { createdAt: "desc" },
  });
  const outcome = await recordSimulatorOutcome(attempt.providerPaymentId!, scenario);
  assert.ok(outcome, "simulator accepted the scenario");
  return attempt;
}

/** Makes a delayed simulator outcome due now (instead of waiting 20 s). */
async function fastForward(attemptProviderId: string) {
  await db.paymentSimulatorSession.update({
    where: { id: attemptProviderId },
    data: { resolveAt: new Date(Date.now() - 1000) },
  });
}

// ── Cash: unchanged behaviour ────────────────────────────────────────────

test("cash on delivery: priced on the server, straight to the kitchen, one e-mail", async () => {
  const log = captureNotificationLog();
  try {
    const r = await order("cash_on_delivery");
    assert.equal(r.paymentMethod, "CASH_ON_DELIVERY");
    assert.equal(r.accessToken, undefined, "a cash order gets no payment pages");
    const row = await orderRow(r.orderNumber);
    assert.equal(Number(row.subtotalEur), 20.9);
    assert.equal(Number(row.totalEur), 20.9, "delivery is free: the total is the items");
    assert.equal(row.paymentStatus, "CASH_DUE");
    assert.ok(row.releasedToKitchenAt);
    // No Resend key in tests: the attempt is made once and recorded as
    // SKIPPED — notificationSentAt is only ever set for a real send.
    assert.equal(row.notificationStatus, "SKIPPED");
    assert.equal(row.notificationAttempts, 1);
    assert.equal(row.notificationSentAt, null);
    assert.equal(row.isTest, false);
    assert.ok((await kitchenNumbers()).includes(r.orderNumber));
    assert.equal(log.countFor(r.orderNumber), 1);
  } finally {
    log.restore();
  }
});

test("the browser cannot change prices, fees, the method or the status", async () => {
  const tampered = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: JSON.stringify([{ productId: "prod_test_pizza", quantity: 1, priceEur: 0.01 }]),
      paymentMethod: "cash_on_delivery",
      checkoutKey: key(),
      userId: null, consents: ALL_CONSENTS,
    },
    deps
  );
  assert.equal(tampered.ok, false);

  const badMethod = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "PAID", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  assert.equal(badMethod.ok, false);

  const unavailable = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: JSON.stringify([{ productId: "prod_test_gone", quantity: 1 }]),
      paymentMethod: "card_online",
      checkoutKey: key(),
      userId: null, consents: ALL_CONSENTS,
    },
    deps
  );
  assert.equal(unavailable.ok, false);
});

// ── Idempotency of placing the order ─────────────────────────────────────

test("double click / repeated request: one checkout key, one order", async () => {
  const k = key();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => order("card_online", { checkoutKey: k }))
  );
  const numbers = new Set(results.map((r) => r.orderNumber));
  assert.equal(numbers.size, 1, "all five requests got the same order");
  assert.equal(await db.order.count({ where: { checkoutKey: k } }), 1);
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
});

test("concurrent checkouts with different keys get different order numbers", async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => order("cash_on_delivery")));
  assert.equal(new Set(results.map((r) => r.orderNumber)).size, 4);
});

// ── Card: created unpaid, invisible to the kitchen ───────────────────────

test("card order starts unpaid, test-flagged and hidden from the kitchen, no e-mail", async () => {
  const log = captureNotificationLog();
  try {
    const r = await order("card_online");
    const row = await orderRow(r.orderNumber);
    assert.equal(row.paymentMethod, "CARD_ONLINE");
    assert.equal(row.paymentStatus, "AWAITING_PAYMENT");
    assert.equal(row.releasedToKitchenAt, null);
    assert.equal(row.notificationSentAt, null);
    assert.equal(row.isTest, true, "simulator orders are test orders");
    assert.ok(r.accessToken);
    assert.ok(!(await kitchenNumbers()).includes(r.orderNumber));
    assert.equal(log.countFor(r.orderNumber), 0);
  } finally {
    log.restore();
  }
});

test("card payment is refused when the switch is off — the order is not even created", async () => {
  process.env.CARD_PAYMENTS_ENABLED = "false";
  // The live-site demo is a separate way in (tested below) — off here.
  await setDemo("OFF");
  try {
    const before = await db.order.count();
    const r = await placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
      deps
    );
    assert.equal(r.ok, false);
    assert.equal(await db.order.count(), before);
  } finally {
    process.env.CARD_PAYMENTS_ENABLED = "true";
    await setDemo("STAFF");
  }
});

test("the amount sent to the provider is the stored order total, in cents", async () => {
  const r = await order("card_online");
  const start = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" });
  assert.equal(start.ok, true);
  const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { order: { orderNumber: r.orderNumber } } });
  assert.equal(attempt.amountMinor, STANDARD_TOTAL_MINOR);
  assert.equal(attempt.currency, "EUR");
  assert.equal(attempt.status, "REDIRECTED");
  const session = await db.paymentSimulatorSession.findUniqueOrThrow({ where: { id: attempt.providerPaymentId! } });
  assert.equal(session.amountMinor, STANDARD_TOTAL_MINOR);
  assert.ok(session.returnUrl.startsWith("http://localhost:3999/api/payments/return?t="));
  assert.equal(session.callbackUrl, "http://localhost:3999/api/payments/callback/simulator");
});

test("double click on 'Pay': one provider session, every click to the same page", async () => {
  const r = await order("card_online");
  const results = await Promise.all(
    Array.from({ length: 6 }, () => startCardPayment({ accessToken: r.accessToken!, locale: "bg" }))
  );
  assert.ok(results.every((x) => x.ok));
  const urls = new Set(results.map((x) => (x.ok ? x.redirect.url : "")));
  assert.equal(urls.size, 1);
  assert.equal(await db.paymentAttempt.count({ where: { order: { orderNumber: r.orderNumber } } }), 1);
});

// ── Success, and exactly once ────────────────────────────────────────────

test("successful card payment: PAID, to the kitchen once, one e-mail — despite repeats", async () => {
  const log = captureNotificationLog();
  try {
    const r = await order("card_online");
    const attempt = await payWith(r.accessToken!, "paid");

    // The browser return, the provider callback (×3) and a refresh, all at once.
    const body = JSON.stringify({ reference: attempt.reference, providerPaymentId: attempt.providerPaymentId });
    const signed = new Headers({ [SIMULATOR_SIGNATURE_HEADER]: signSimulatorBody(body, process.env.PAYMENT_SIMULATOR_SECRET!) });
    await quiet(() =>
      Promise.all([
        syncAttempt(attempt.id),
        syncAttempt(attempt.id),
        refreshOrderPayment(attempt.orderId),
        ...[1, 2, 3].map(() =>
          handleProviderCallback("simulator", { method: "POST", headers: signed, query: new URLSearchParams(), bodyText: body })
        ),
      ])
    );

    const row = await orderRow(r.orderNumber);
    assert.equal(row.paymentStatus, "PAID");
    assert.ok(row.paidAt);
    assert.ok(row.releasedToKitchenAt);
    const releasedAt = row.releasedToKitchenAt!.getTime();
    assert.equal(await notificationAttempts(r.orderNumber), 1, "exactly one notification attempt");
    assert.deepEqual(
      (await kitchenNumbers()).filter((n) => n === r.orderNumber),
      [r.orderNumber],
      "exactly one kitchen entry"
    );

    // A late duplicate callback changes nothing.
    await quiet(() =>
      handleProviderCallback("simulator", { method: "POST", headers: signed, query: new URLSearchParams(), bodyText: body })
    );
    const again = await orderRow(r.orderNumber);
    assert.equal(again.releasedToKitchenAt!.getTime(), releasedAt);
    assert.equal(await notificationAttempts(r.orderNumber), 1);

    // "Pay" on a paid order never opens a second session.
    const second = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" });
    assert.deepEqual(second, { ok: false, code: "ALREADY_PAID" });
    assert.equal(row.paymentAlert, null);
  } finally {
    log.restore();
  }
});

test("opening the success URL without paying proves nothing", async () => {
  const r = await order("card_online");
  await startCardPayment({ accessToken: r.accessToken!, locale: "bg" });
  // The customer "returns" (success URL, back button, refresh) but never paid.
  const view = await quiet(() => getCustomerPaymentView(r.accessToken!, { refresh: true, refreshIntervalMs: 0 }));
  assert.equal(view?.state, "PENDING");
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "AWAITING_PAYMENT");
  assert.equal(row.releasedToKitchenAt, null);
});

test("a forged callback is rejected and marks nothing", async () => {
  const r = await order("card_online");
  const attempt = await payWith(r.accessToken!, "declined");
  const body = JSON.stringify({ reference: attempt.reference });
  const outcome = await quiet(() =>
    handleProviderCallback("simulator", {
      method: "POST",
      headers: new Headers({ [SIMULATOR_SIGNATURE_HEADER]: "00".repeat(32) }),
      query: new URLSearchParams(),
      bodyText: body,
    })
  );
  assert.equal(outcome.status, 401);
  // Even an authentic callback can only trigger the status check — and the
  // provider says "declined", so nothing is paid.
  const unknown = await quiet(() =>
    handleProviderCallback("simulator", {
      method: "POST",
      headers: new Headers({
        [SIMULATOR_SIGNATURE_HEADER]: signSimulatorBody('{"reference":"PP0-NOPE"}', process.env.PAYMENT_SIMULATOR_SECRET!),
      }),
      query: new URLSearchParams(),
      bodyText: '{"reference":"PP0-NOPE"}',
    })
  );
  assert.equal(unknown.status, 200, "unknown attempts are acknowledged, not retried forever");
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "AWAITING_PAYMENT");
});

// ── Declined, cancelled, pending, timeout ────────────────────────────────

test("declined card: FAILED, never reaches the kitchen; retry pays the SAME order", async () => {
  const log = captureNotificationLog();
  try {
    const r = await order("card_online");
    const ordersBefore = await db.order.count();
    const first = await payWith(r.accessToken!, "declined");
    await quiet(() => syncAttempt(first.id));
    let row = await orderRow(r.orderNumber);
    assert.equal(row.paymentStatus, "FAILED");
    assert.equal(row.releasedToKitchenAt, null);
    assert.ok(!(await kitchenNumbers()).includes(r.orderNumber));
    assert.equal(log.countFor(r.orderNumber), 0);

    const second = await payWith(r.accessToken!, "paid");
    assert.notEqual(second.id, first.id, "a new attempt after a declined one");
    await quiet(() => syncAttempt(second.id));
    row = await orderRow(r.orderNumber);
    assert.equal(row.paymentStatus, "PAID");
    assert.ok(row.releasedToKitchenAt);
    assert.equal(await db.order.count(), ordersBefore, "no second order was created");
    assert.equal(await notificationAttempts(r.orderNumber), 1);
  } finally {
    log.restore();
  }
});

test("customer cancels on the bank page: CANCELLED, not in the kitchen", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "cancelled");
  await quiet(() => syncAttempt(a.id));
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "CANCELLED");
  assert.equal(row.releasedToKitchenAt, null);
  const view = await getCustomerPaymentView(r.accessToken!);
  assert.equal(view?.state, "FAILED");
  assert.equal(view?.latestAttemptStatus, "CANCELLED");
});

test("pending: stays out of the kitchen; 'Pay' reuses the open session", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "pending");
  await quiet(() => syncAttempt(a.id));
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: a.id } })).status, "PENDING");
  assert.equal((await orderRow(r.orderNumber)).releasedToKitchenAt, null);
  const again = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" });
  assert.ok(again.ok && again.reused, "no second session while one is open");
});

test("late confirmation: pending first, PAID later — released once", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "latePaid");
  await quiet(() => syncAttempt(a.id));
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "AWAITING_PAYMENT");
  await fastForward(a.providerPaymentId!);
  await quiet(() => syncAttempt(a.id));
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID");
  assert.ok(row.releasedToKitchenAt);
  assert.equal(row.paymentAlert, null, "pending → paid is a normal flow, not an alert");
});

test("looked declined, bank confirms later: PAID, HELD for the staff, never auto-cooked", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "lateAfterDecline");
  await quiet(() => syncAttempt(a.id));
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "FAILED");
  await fastForward(a.providerPaymentId!);
  await quiet(() => refreshOrderPayment(a.orderId));
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID", "a real payment is never hidden");
  assert.equal(row.releasedToKitchenAt, null, "the customer may no longer want it — a person decides");
  assert.equal(row.paymentAlert, "LATE_CONFIRMATION");
  assert.ok(!(await kitchenNumbers()).includes(r.orderNumber));
});

test("provider timeout: nothing changes, no failure is invented; later answer wins", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "unreachable");
  await quiet(async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      await syncAttempt(a.id);
    } finally {
      console.warn = warn;
    }
  });
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(attempt.status, "REDIRECTED", "a timeout is not a decline");
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "AWAITING_PAYMENT");
  await fastForward(a.providerPaymentId!);
  await quiet(() => syncAttempt(a.id));
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "PAID");
});

test("different amount confirmed: not released, flagged AMOUNT_MISMATCH", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "amountMismatch");
  await quiet(() => syncAttempt(a.id));
  const row = await orderRow(r.orderNumber);
  assert.notEqual(row.paymentStatus, "PAID");
  assert.equal(row.releasedToKitchenAt, null);
  assert.equal(row.paymentAlert, "AMOUNT_MISMATCH");
});

test("two successful attempts on one order: kept, flagged DUPLICATE_PAYMENT, kitchen once", async () => {
  const log = captureNotificationLog();
  try {
    const r = await order("card_online");
    const first = await payWith(r.accessToken!, "paid");
    await quiet(() => syncAttempt(first.id));
    // Force a second attempt that the provider ALSO reports as paid.
    const second = await db.paymentAttempt.create({
      data: {
        orderId: first.orderId,
        reference: `${first.reference}-B`,
        provider: first.provider,
        environment: first.environment,
        providerPaymentId: "fake",
        amountMinor: first.amountMinor,
        currency: first.currency,
        status: "REDIRECTED",
      },
    });
    await quiet(() =>
      applyProviderStatus(second, { state: "PAID", rawStatus: "PAID", amountMinor: first.amountMinor, currency: "EUR" })
    );
    const row = await orderRow(r.orderNumber);
    assert.equal(row.paymentAlert, "DUPLICATE_PAYMENT");
    assert.equal(await notificationAttempts(r.orderNumber), 1);
  } finally {
    log.restore();
  }
});

test("payment confirmed after the staff cancelled the order: never cooked, flagged", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "paid");
  await db.order.update({ where: { orderNumber: r.orderNumber }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await quiet(() => syncAttempt(a.id));
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID");
  assert.equal(row.releasedToKitchenAt, null);
  assert.equal(row.paymentAlert, "PAID_AFTER_CANCEL");
});

// ── The customer never came back (app killed, phone restarted) ───────────

test("app restarted between redirect and return: the callback alone completes the order", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "paid");
  // No browser return at all — only the provider's server-to-server callback.
  const body = JSON.stringify({ reference: a.reference, providerPaymentId: a.providerPaymentId });
  await quiet(() =>
    handleProviderCallback("simulator", {
      method: "POST",
      headers: new Headers({ [SIMULATOR_SIGNATURE_HEADER]: signSimulatorBody(body, process.env.PAYMENT_SIMULATOR_SECRET!) }),
      query: new URLSearchParams(),
      bodyText: body,
    })
  );
  assert.ok((await kitchenNumbers()).includes(r.orderNumber));
  // Whenever the customer finally opens the app again, the reminder's link
  // lands on the server's answer.
  const view = await getCustomerPaymentView(r.accessToken!);
  assert.equal(view?.state, "PAID");
});

// ── Reports ──────────────────────────────────────────────────────────────

test("reports: test and unpaid card orders are not revenue; cash and card are split", async () => {
  const cash = await order("cash_on_delivery");
  await db.order.update({ where: { orderNumber: cash.orderNumber }, data: { status: "DELIVERED", completedAt: new Date(), acceptedAt: new Date() } });

  // A REAL (non-test) paid card order, delivered.
  const card = await order("card_online");
  const a = await payWith(card.accessToken!, "paid");
  await quiet(() => syncAttempt(a.id));
  await db.order.update({
    where: { orderNumber: card.orderNumber },
    data: { isTest: false, status: "DELIVERED", completedAt: new Date(), acceptedAt: new Date() },
  });

  const range = resolvePresetRange("day", new Date());
  const report = await getAdminReport({ range, page: 1 });
  // Only non-test released orders count; every simulator order above is test.
  const delivered = await db.order.findMany({
    where: { completedAt: { not: null }, isTest: false, releasedToKitchenAt: { not: null } },
  });
  const expectedTotal = delivered.reduce((s, o) => s + Number(o.totalEur), 0);
  assert.equal(report.summary.revenueEur, Math.round(expectedTotal * 100) / 100);
  assert.equal(report.summary.cardRevenueEur, 20.9);
  assert.equal(
    Math.round((report.summary.cashRevenueEur + report.summary.cardRevenueEur) * 100) / 100,
    report.summary.revenueEur
  );
  assert.equal(report.summary.paidOnlineCount, 1, "simulator payments are not counted as money");
});

// ── The restaurant e-mail: honest accounting, retries, no duplicates ─────

test("a failed restaurant e-mail is recorded as FAILED, retried later, and sent once", async () => {
  // A cash order is a real (non-test) order, so it does reach the sender.
  const r = await order("cash_on_delivery"); // first attempt: SKIPPED (no key in tests)
  const id = (await orderRow(r.orderNumber)).id;
  // Put it back to "never attempted" to drive the sender by hand.
  await db.order.update({
    where: { id },
    data: { notificationStatus: null, notificationAttempts: 0, notificationClaimedAt: null, notificationError: null },
  });

  let calls = 0;
  let fail = true;
  const keys: (string | undefined)[] = [];
  const sender = async (_data: unknown, opts?: { idempotencyKey?: string }) => {
    calls++;
    keys.push(opts?.idempotencyKey);
    await new Promise((res) => setTimeout(res, 30));
    return fail ? { status: "failed" as const, error: "Resend 503" } : { status: "sent" as const };
  };

  // Five concurrent triggers → ONE attempt (the lease).
  const results = await quiet(() =>
    Promise.all(Array.from({ length: 5 }, () => notifyRestaurantOnce(id, sender)))
  );
  assert.equal(calls, 1);
  assert.deepEqual(results.filter(Boolean), ["FAILED"]);
  let row = await orderRow(r.orderNumber);
  assert.equal(row.notificationStatus, "FAILED");
  assert.equal(row.notificationSentAt, null, "a failed e-mail is never marked as sent");
  assert.equal(row.notificationError, "Resend 503");

  // Immediately again: still inside the wait, nothing is sent.
  assert.equal(await retryFailedNotifications(sender), 0);
  assert.equal(calls, 1);

  // After the wait the retry goes out — and succeeds.
  fail = false;
  await db.order.update({ where: { id }, data: { notificationClaimedAt: new Date(Date.now() - 61_000) } });
  assert.equal(await quiet(() => retryFailedNotifications(sender)), 1);
  row = await orderRow(r.orderNumber);
  assert.equal(row.notificationStatus, "SENT");
  assert.ok(row.notificationSentAt);
  assert.equal(row.notificationAttempts, 2);
  assert.equal(calls, 2);
  // Both attempts carried the same Resend idempotency key.
  assert.deepEqual(new Set(keys), new Set([`pp-new-order-${id}`]));

  // Sent is final: nothing ever sends it again.
  assert.equal(await notifyRestaurantOnce(id, sender), null);
  assert.equal(calls, 2);
});

test("retries stop after the attempt limit; a human sees FAILED in the admin", async () => {
  const r = await order("cash_on_delivery");
  const id = (await orderRow(r.orderNumber)).id;
  await db.order.update({
    where: { id },
    data: { notificationStatus: "FAILED", notificationAttempts: MAX_NOTIFICATION_ATTEMPTS, notificationClaimedAt: new Date(0) },
  });
  let calls = 0;
  await retryFailedNotifications(async () => {
    calls++;
    return { status: "sent" as const };
  });
  assert.equal(calls, 0);
  assert.equal((await orderRow(r.orderNumber)).notificationStatus, "FAILED");
});

test("test (simulator) orders never reach the restaurant inbox", async () => {
  const r = await order("card_online");
  const a = await payWith(r.accessToken!, "paid");
  let calls = 0;
  await quiet(() => syncAttempt(a.id));
  // The release above already recorded the decision; a direct call is a no-op.
  assert.equal(
    await notifyRestaurantOnce(a.orderId, async () => {
      calls++;
      return { status: "sent" as const };
    }),
    null
  );
  const row = await orderRow(r.orderNumber);
  assert.equal(row.notificationStatus, "SKIPPED");
  assert.equal(row.notificationError, "тестова поръчка");
  assert.equal(calls, 0);
});

// ── The live-site card DEMO (Admin → Settings switch) ────────────────────

/** Runs `fn` as the REAL production site: no payment env, APP_ENV=production. */
async function asProduction<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { APP_ENV: process.env.APP_ENV, CARD_PAYMENTS_ENABLED: process.env.CARD_PAYMENTS_ENABLED, PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER, APP_BASE_URL: process.env.APP_BASE_URL };
  process.env.APP_ENV = "production";
  // Production is HTTPS: the demo refuses to send anyone to an http:// page there.
  process.env.APP_BASE_URL = "https://pizza.example.test";
  process.env.CARD_PAYMENTS_ENABLED = "false";
  delete process.env.PAYMENT_PROVIDER;
  try {
    return await fn();
  } finally {
    Object.assign(process.env, saved);
  }
}

async function setDemo(mode: "OFF" | "STAFF" | "EVERYONE") {
  await db.restaurantSettings.update({ where: { id: "restaurant" }, data: { cardDemoMode: mode } });
}

test("demo: production refuses the env simulator, the demo switch decides who sees the card", async () => {
  await asProduction(async () => {
    assert.equal(getEffectivePaymentConfig().enabled, false, "the env simulator stays refused in production");

    await setDemo("STAFF"); // what the migration leaves the live site on
    assert.equal((await resolveCheckoutPayment(null)).available, false, "guest: no card");
    assert.equal((await resolveCheckoutPayment("CUSTOMER")).available, false, "customer: no card");
    const admin = await resolveCheckoutPayment("SUPER_ADMIN");
    assert.ok(admin.available && admin.demo && admin.config.isTest, "admin: demo card, test orders");
    assert.ok((await resolveCheckoutPayment("STAFF")).available, "staff: demo card");

    // UBB (2026-09-29): the real site never shows the demo to the public —
    // a stored EVERYONE is read as STAFF in production.
    await setDemo("EVERYONE");
    assert.equal(
      (await resolveCheckoutPayment(null)).available,
      false,
      "production + EVERYONE: guests still get no demo card"
    );
    assert.equal((await resolveCheckoutPayment("CUSTOMER")).available, false, "nor do customers");
    assert.ok((await resolveCheckoutPayment("STAFF")).available, "staff keep the demo");

    await setDemo("OFF");
    assert.equal((await resolveCheckoutPayment("SUPER_ADMIN")).available, false, "OFF: nobody");
  });
  await setDemo("STAFF");
});

test("demo: an admin pays with the test card on production — PAID, test order, never e-mailed", async () => {
  await asProduction(async () => {
    await setDemo("STAFF");
    // A customer cannot sneak a card order through a crafted request.
    const refused = await placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS, role: "CUSTOMER" },
      deps
    );
    assert.equal(refused.ok, false);

    const placed = await placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS, role: "SUPER_ADMIN" },
      deps
    );
    assert.ok(placed.ok && placed.accessToken);
    const r = placed as Extract<typeof placed, { ok: true }>;
    const row0 = await orderRow(r.orderNumber);
    assert.equal(row0.isTest, true, "demo orders are test orders");

    const a = await payWith(r.accessToken!, "paid");
    assert.equal(a.provider, "SIMULATOR");
    await quiet(() => syncAttempt(a.id));
    const row = await orderRow(r.orderNumber);
    assert.equal(row.paymentStatus, "PAID");
    assert.ok(row.releasedToKitchenAt);
    assert.equal(row.notificationStatus, "SKIPPED");

    // Switching the demo OFF stops NEW demo payments.
    const other = await placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS, role: "ADMIN" },
      deps
    );
    assert.ok(other.ok);
    await setDemo("OFF");
    const start = await startCardPayment({ accessToken: (other as { accessToken: string }).accessToken, locale: "bg" });
    assert.deepEqual(start, { ok: false, code: "DISABLED" });
  });
  await setDemo("STAFF");
});

test("demo EVERYONE on production: a guest's crafted card order is refused", async () => {
  await asProduction(async () => {
    await setDemo("EVERYONE");
    const before = await db.order.count();
    const refused = await placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
      deps
    );
    assert.deepEqual(refused, { ok: false, error: "CARD_UNAVAILABLE" });
    assert.equal(await db.order.count(), before, "no order is created");
  });
  await setDemo("STAFF");
});

/** Runs `fn` as a STAGING deployment (the public demo lives there). */
async function asStaging<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { APP_ENV: process.env.APP_ENV, CARD_PAYMENTS_ENABLED: process.env.CARD_PAYMENTS_ENABLED, PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER, APP_BASE_URL: process.env.APP_BASE_URL };
  process.env.APP_ENV = "staging";
  process.env.APP_BASE_URL = "https://staging.example.test";
  process.env.CARD_PAYMENTS_ENABLED = "false";
  delete process.env.PAYMENT_PROVIDER;
  try {
    return await fn();
  } finally {
    Object.assign(process.env, saved);
  }
}

test("demo EVERYONE on staging: a guest with no account pays with the test card", async () => {
  await asStaging(async () => {
    await setDemo("EVERYONE");
    const setup = await resolveCheckoutPayment(null);
    assert.ok(setup.available && setup.demo, "the guest sees the demo card option");

    // No session at all: no userId, no role.
    const placed = await placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
      deps
    );
    assert.ok(placed.ok && placed.accessToken, "the guest's card order is accepted");
    const r = placed as Extract<typeof placed, { ok: true }>;
    assert.equal((await orderRow(r.orderNumber)).isTest, true);

    // The access token alone opens the payment — no account needed.
    const a = await payWith(r.accessToken!, "paid");
    assert.equal(a.amountMinor, STANDARD_TOTAL_MINOR, "free delivery: the items are the whole charge");
    await quiet(() => syncAttempt(a.id));
    const row = await orderRow(r.orderNumber);
    assert.equal(row.paymentStatus, "PAID");
    assert.equal(row.userId, null);
    assert.ok(row.releasedToKitchenAt);
  });
  await setDemo("STAFF");
});
