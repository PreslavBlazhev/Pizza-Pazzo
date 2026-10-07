/**
 * Real-bank readiness: the parts of the card flow that do NOT depend on the
 * bank's protocol and must hold for any adapter (docs/UBB-VPOS-INTEGRATION.md).
 *
 *   - hosted pages opened with a signed form POST (BORICA / UPC style)
 *   - session creation with an UNKNOWN outcome (timeout after sending)
 *   - late confirmations held for staff, released once, with an audit trail
 *   - reconciliation of payments nobody is watching
 *   - refunds made in the bank's panel, recorded once and never over-refunded
 *   - the reconcile endpoint, status endpoint, return route, rate limiter
 *
 * ⚠️ The simulator stands in for the bank. This proves OUR side only.
 * Run: npm run test:payments
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  CREATION_UNCONFIRMED,
  refreshOrderPayment,
  startCardPayment,
  syncAttempt,
  type StartPaymentDeps,
} from "@/lib/payments/service";
import { createSimulatorProvider, recordSimulatorOutcome } from "@/lib/payments/providers/simulator";
import { getEffectivePaymentConfig } from "@/lib/payments/providers";
import { PaymentProviderError, type PaymentProvider } from "@/lib/payments/types";
import { buildAutoPostPage } from "@/lib/payments/hosted-form";
import { reconcileOpenPayments, reconcileBackoffMs, UNRESOLVED_AFTER_MS } from "@/lib/payments/reconcile";
import { acknowledgePaymentAlert, recordBankRefund, releaseHeldPaidOrder } from "@/lib/payments/staff";
import { getPaymentAttention } from "@/lib/payments/admin";
import { getPendingOrders } from "@/lib/orders";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { POST as reconcileRoute } from "@/app/api/payments/reconcile/route";
import { GET as statusRoute } from "@/app/api/payments/status/route";
import { GET as returnRoute } from "@/app/api/payments/return/route";
import { captureNotificationLog, order, quiet } from "./helpers";

after(async () => {
  await db.$disconnect();
});
beforeEach(() => resetRateLimits());

const ADMIN = { id: "admin-test", email: "admin@example.test", role: "ADMIN" };

async function orderRow(orderNumber: number) {
  return db.order.findUniqueOrThrow({ where: { orderNumber } });
}
async function attemptsOf(orderNumber: number) {
  return db.paymentAttempt.findMany({ where: { order: { orderNumber } }, orderBy: { createdAt: "asc" } });
}
async function kitchenNumbers(): Promise<number[]> {
  return (await getPendingOrders()).map((o) => o.orderNumber);
}

/** The real simulator, with a twist injected around createSession. */
function wrapped(
  twist: (real: PaymentProvider) => Partial<PaymentProvider>
): StartPaymentDeps["providerForNewPayment"] {
  return async () => {
    const config = getEffectivePaymentConfig();
    const real = createSimulatorProvider(config);
    return { provider: { ...real, ...twist(real) }, config };
  };
}

/** Pretends an attempt was created `ms` ago. */
async function age(attemptId: string, ms: number) {
  await db.paymentAttempt.update({
    where: { id: attemptId },
    data: { createdAt: new Date(Date.now() - ms), lastCheckedAt: null },
  });
}

// ── Hosted page opened with a form POST ─────────────────────────────────

const GATEWAY = "https://gateway.example.test/cgi-bin/pay";

test("POST-form gateway: the signed fields are kept, and every click re-posts the same session", async () => {
  const r = await order("card_online");
  const deps: StartPaymentDeps = {
    providerForNewPayment: wrapped((real) => ({
      async createSession(input) {
        const s = await real.createSession(input);
        return { ...s, redirectUrl: GATEWAY, postFields: { ORDER: input.reference, AMOUNT: String(input.amountMinor), P_SIGN: "ab12" } };
      },
    })),
  };
  const first = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" }, deps);
  assert.ok(first.ok && !first.reused);
  assert.equal(first.redirect.url, GATEWAY);
  assert.equal(first.redirect.postFields?.AMOUNT, "2090", "the stored server total, in cents");
  const again = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" }, deps);
  assert.ok(again.ok && again.reused);
  assert.deepEqual(again.redirect, first.redirect);
  assert.equal((await attemptsOf(r.orderNumber)).length, 1);
});

test("POST-form gateway: unusable fields are refused — the session is recorded, never opened", async () => {
  const r = await order("card_online");
  const res = await quiet(() =>
    startCardPayment(
      { accessToken: r.accessToken!, locale: "bg" },
      {
        providerForNewPayment: wrapped((real) => ({
          async createSession(input) {
            const s = await real.createSession(input);
            return { ...s, redirectUrl: GATEWAY, postFields: { 'x" onfocus="alert(1)': "1" } };
          },
        })),
      }
    )
  );
  assert.deepEqual(res, { ok: false, code: "PROVIDER_ERROR" });
  const [a] = await attemptsOf(r.orderNumber);
  assert.equal(a.status, "ERROR");
  assert.ok(a.providerPaymentId, "kept, so a status check could still find money on it");
});

test("auto-post page: fields escaped, strict own CSP with nonce, HTTPS-only form target", () => {
  const page = buildAutoPostPage({
    url: GATEWAY,
    fields: { DESC: '"><script>alert(1)</script>', ORDER: "PP1-AB" },
    locale: "en",
    nonce: "n0nce",
  });
  assert.ok(!page.html.includes("<script>alert(1)"));
  assert.ok(page.html.includes("&quot;&gt;&lt;script&gt;"));
  assert.ok(page.html.includes(`action="${GATEWAY}"`));
  assert.ok(page.html.includes("<noscript>"), "works without JavaScript");
  assert.match(page.csp, /default-src 'none'/);
  assert.match(page.csp, /script-src 'nonce-n0nce'/);
  assert.match(page.csp, /form-action https:/);
  assert.match(page.csp, /frame-ancestors 'none'/);
  assert.throws(() => buildAutoPostPage({ url: "javascript:alert(1)", fields: {}, locale: "bg", nonce: "x" }));
});

// ── Session creation with an unknown outcome ───────────────────────────

test("timeout AFTER the bank registered the session: no second session; settles by reference", async () => {
  const r = await order("card_online");
  let created = 0;
  const timesOut = wrapped((real) => ({
    async createSession(input) {
      created++;
      await real.createSession(input); // the bank got it…
      throw new PaymentProviderError("timeout", "unknown"); // …the answer was lost
    },
  }));
  const first = await quiet(() => startCardPayment({ accessToken: r.accessToken!, locale: "bg" }, { providerForNewPayment: timesOut }));
  assert.deepEqual(first, { ok: false, code: "UNCONFIRMED" });
  let [a] = await attemptsOf(r.orderNumber);
  assert.equal(a.status, "PENDING");
  assert.equal(a.failureReason, CREATION_UNCONFIRMED);
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "AWAITING_PAYMENT");

  // The customer clicks again: we ask the bank by reference — it HAS it.
  const second = await quiet(() => startCardPayment({ accessToken: r.accessToken!, locale: "bg" }, { providerForNewPayment: timesOut }));
  assert.deepEqual(second, { ok: false, code: "UNCONFIRMED" });
  assert.equal(created, 1, "a second session is never opened next to a possibly payable one");
  [a] = await attemptsOf(r.orderNumber);
  assert.equal(a.failureReason, CREATION_UNCONFIRMED, "still pending at the bank, still tracked");

  // The bank later reports it paid (e.g. the customer had reached the page).
  const session = await db.paymentSimulatorSession.findUniqueOrThrow({ where: { reference: a.reference } });
  await recordSimulatorOutcome(session.id, "paid");
  await quiet(() => syncAttempt(a.id));
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID");
  assert.ok(row.releasedToKitchenAt, "it never looked failed — normal release");
  assert.equal((await attemptsOf(r.orderNumber))[0].providerPaymentId, session.id, "the bank's id learnt by reference");
});

test("timeout BEFORE the bank got it: verified as not registered, then a fresh session opens", async () => {
  const r = await order("card_online");
  const neverSent = wrapped(() => ({
    async createSession() {
      throw new Error("socket hang up"); // not a PaymentProviderError → unknown
    },
  }));
  const first = await quiet(() => startCardPayment({ accessToken: r.accessToken!, locale: "bg" }, { providerForNewPayment: neverSent }));
  assert.deepEqual(first, { ok: false, code: "UNCONFIRMED" });
  const retry = await quiet(() => startCardPayment({ accessToken: r.accessToken!, locale: "bg" }));
  assert.ok(retry.ok && !retry.reused, JSON.stringify(retry));
  const [old, fresh] = await attemptsOf(r.orderNumber);
  assert.equal(old.status, "ERROR");
  assert.equal(old.failureReason, "NOT_REGISTERED_AT_PROVIDER");
  assert.equal(fresh.status, "REDIRECTED");
});

test("a definite refusal from the provider frees the order at once", async () => {
  const r = await order("card_online");
  const res = await quiet(() =>
    startCardPayment(
      { accessToken: r.accessToken!, locale: "bg" },
      { providerForNewPayment: wrapped(() => ({ async createSession() { throw new PaymentProviderError("bad terminal", "rejected"); } })) }
    )
  );
  assert.deepEqual(res, { ok: false, code: "PROVIDER_ERROR" });
  assert.equal((await attemptsOf(r.orderNumber))[0].status, "ERROR");
  const retry = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" });
  assert.ok(retry.ok && !retry.reused);
});

test("a creation that crashed half-way is treated as unknown, never as 'no money'", async () => {
  const r = await order("card_online");
  const o = await orderRow(r.orderNumber);
  const crashed = await db.paymentAttempt.create({
    data: {
      orderId: o.id,
      reference: `PP${o.orderNumber}-DEADBEEF`,
      provider: "SIMULATOR",
      environment: "simulator",
      amountMinor: 2090,
      currency: "EUR",
      status: "CREATED",
      createdAt: new Date(Date.now() - 5 * 60_000),
    },
  });
  // First click: the stale row becomes an unconfirmed creation, is checked by
  // reference (the simulator has no such session → NOT_FOUND), and only then
  // a new session opens.
  const res = await quiet(() => startCardPayment({ accessToken: r.accessToken!, locale: "bg" }));
  assert.ok(res.ok, JSON.stringify(res));
  const after = await db.paymentAttempt.findUniqueOrThrow({ where: { id: crashed.id } });
  assert.equal(after.failureReason, "NOT_REGISTERED_AT_PROVIDER");
});

// ── Late confirmation: held, released by a person, once ─────────────────

async function heldLateOrder() {
  const r = await order("card_online");
  const start = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" });
  assert.ok(start.ok);
  const [a] = await attemptsOf(r.orderNumber);
  await recordSimulatorOutcome(a.providerPaymentId!, "lateAfterDecline");
  await quiet(() => syncAttempt(a.id));
  await db.paymentSimulatorSession.update({ where: { id: a.providerPaymentId! }, data: { resolveAt: new Date(Date.now() - 1000) } });
  await quiet(() => refreshOrderPayment(a.orderId));
  return r;
}

test("late confirmation: on the attention list; released by staff exactly once, audited, one e-mail", async () => {
  const log = captureNotificationLog();
  try {
    const r = await heldLateOrder();
    let row = await orderRow(r.orderNumber);
    assert.equal(row.paymentStatus, "PAID");
    assert.equal(row.releasedToKitchenAt, null);
    const attention = await getPaymentAttention();
    const item = attention.find((i) => i.orderNumber === r.orderNumber);
    assert.ok(item?.heldPaid, "the board shows it");

    const results = await Promise.all([releaseHeldPaidOrder(row.id, ADMIN), releaseHeldPaidOrder(row.id, ADMIN)]);
    assert.equal(results.filter((x) => x.ok).length, 1, "two taps, one release");
    row = await orderRow(r.orderNumber);
    assert.ok(row.releasedToKitchenAt);
    assert.ok(row.paymentAlertAckAt);
    assert.ok((await kitchenNumbers()).includes(r.orderNumber));
    assert.equal(await db.paymentAuditEvent.count({ where: { orderId: row.id, action: "RELEASE_HELD_PAID_ORDER" } }), 1);
    assert.ok(!(await getPaymentAttention()).some((i) => i.orderNumber === r.orderNumber));
    // Test orders never e-mail; what matters is that release went through notifyRestaurantOnce once.
    assert.equal(row.notificationAttempts, 1);
  } finally {
    log.restore();
  }
});

test("a held order that staff cancelled can never be released; unpaid orders neither", async () => {
  const r = await heldLateOrder();
  const row = await orderRow(r.orderNumber);
  await db.order.update({ where: { id: row.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  const res = await releaseHeldPaidOrder(row.id, ADMIN);
  assert.equal(res.ok, false);
  const unpaid = await order("card_online");
  assert.equal((await releaseHeldPaidOrder((await orderRow(unpaid.orderNumber)).id, ADMIN)).ok, false);
  assert.equal((await orderRow(unpaid.orderNumber)).releasedToKitchenAt, null);
});

test("acknowledging an alert removes it from the board but keeps it on the order", async () => {
  const r = await order("card_online");
  const row = await orderRow(r.orderNumber);
  await db.order.update({ where: { id: row.id }, data: { paymentAlert: "AMOUNT_MISMATCH" } });
  assert.ok((await getPaymentAttention()).some((i) => i.id === row.id));
  assert.equal((await acknowledgePaymentAlert(row.id, ADMIN)).ok, true);
  assert.equal((await acknowledgePaymentAlert(row.id, ADMIN)).ok, false, "once");
  assert.ok(!(await getPaymentAttention()).some((i) => i.id === row.id));
  assert.equal((await orderRow(r.orderNumber)).paymentAlert, "AMOUNT_MISMATCH");
});

// ── Reconciliation ──────────────────────────────────────────────────────

test("reconcile: the customer left, no callback came — the payment is still found and released", async () => {
  const r = await order("card_online");
  assert.ok((await startCardPayment({ accessToken: r.accessToken!, locale: "bg" })).ok);
  const [a] = await attemptsOf(r.orderNumber);
  await recordSimulatorOutcome(a.providerPaymentId!, "paid"); // the bank has it; nobody asks us
  await age(a.id, 5 * 60_000);
  const s = await quiet(() => reconcileOpenPayments({ limit: 50 }));
  assert.ok(s.settled >= 1);
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID");
  assert.ok(row.releasedToKitchenAt);
});

test("reconcile: backs off per attempt, skips young attempts, flags long-unresolved ones", async () => {
  const r = await order("card_online");
  assert.ok((await startCardPayment({ accessToken: r.accessToken!, locale: "bg" })).ok);
  const [a] = await attemptsOf(r.orderNumber);
  await recordSimulatorOutcome(a.providerPaymentId!, "pending");

  // Younger than a minute: left to the customer's own page.
  await reconcileOpenPayments({ limit: 50 });
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: a.id } })).lastCheckedAt, null);

  await age(a.id, UNRESOLVED_AFTER_MS + 60_000);
  await reconcileOpenPayments({ limit: 50 });
  const checked = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: a.id } })).lastCheckedAt;
  assert.ok(checked);
  assert.equal((await orderRow(r.orderNumber)).paymentAlert, "UNRESOLVED_PAYMENT");

  await reconcileOpenPayments({ limit: 50 });
  assert.deepEqual(
    (await db.paymentAttempt.findUniqueOrThrow({ where: { id: a.id } })).lastCheckedAt,
    checked,
    "backoff: not asked again right away"
  );
  assert.ok(reconcileBackoffMs(UNRESOLVED_AFTER_MS) >= 15 * 60_000);

  // The bank finally confirms, hours later: PAID, but held for a person.
  await db.paymentSimulatorSession.update({ where: { id: a.providerPaymentId! }, data: { state: "PAID" } });
  await quiet(() => syncAttempt(a.id));
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID");
  assert.equal(row.releasedToKitchenAt, null, "hours later is not cooked automatically");
  assert.equal(row.paymentAlert, "LATE_CONFIRMATION");
});

test("reconcile endpoint: absent without a secret, 401 on a wrong one, runs with the right one", async () => {
  const call = (auth?: string) =>
    reconcileRoute(
      new NextRequest("http://localhost:3999/api/payments/reconcile", {
        method: "POST",
        headers: { ...(auth && { authorization: auth }), "x-forwarded-for": "203.0.113.9" },
      })
    );
  const saved = process.env.PAYMENT_RECONCILE_SECRET;
  try {
    delete process.env.PAYMENT_RECONCILE_SECRET;
    assert.equal((await call("Bearer whatever")).status, 404);
    process.env.PAYMENT_RECONCILE_SECRET = "short";
    assert.equal((await call("Bearer short")).status, 404, "a weak secret disables it");
    process.env.PAYMENT_RECONCILE_SECRET = "r".repeat(40);
    assert.equal((await call()).status, 401);
    assert.equal((await call("Bearer " + "r".repeat(39))).status, 401);
    const ok = await call("Bearer " + "r".repeat(40));
    assert.equal(ok.status, 200);
    assert.ok("checked" in (await ok.json()));
  } finally {
    if (saved === undefined) delete process.env.PAYMENT_RECONCILE_SECRET;
    else process.env.PAYMENT_RECONCILE_SECRET = saved;
  }
});

// ── Refunds made in the bank's panel ────────────────────────────────────

async function paidOrder() {
  const r = await order("card_online");
  assert.ok((await startCardPayment({ accessToken: r.accessToken!, locale: "bg" })).ok);
  const [a] = await attemptsOf(r.orderNumber);
  await recordSimulatorOutcome(a.providerPaymentId!, "paid");
  await quiet(() => syncAttempt(a.id));
  return { r, a, row: await orderRow(r.orderNumber) };
}

const key = () => crypto.randomUUID();

test("refund record: only for a PAID attempt, never above what was paid, a double submit counts once", async () => {
  const { a, row } = await paidOrder();
  const base = { orderId: row.id, attemptId: a.id, kind: "REFUND" as const, bankReference: "RRN 123456" };

  const unpaid = await order("card_online");
  const unpaidRow = await orderRow(unpaid.orderNumber);
  assert.equal((await recordBankRefund({ ...base, orderId: unpaidRow.id, amountMinor: 100, idempotencyKey: key() }, ADMIN)).ok, false,
    "the attempt must belong to the order");

  assert.equal((await recordBankRefund({ ...base, amountMinor: 2091, idempotencyKey: key() }, ADMIN)).ok, false);
  assert.equal((await recordBankRefund({ ...base, amountMinor: 0, idempotencyKey: key() }, ADMIN)).ok, false);
  assert.equal((await recordBankRefund({ ...base, bankReference: "", amountMinor: 100, idempotencyKey: key() }, ADMIN)).ok, false);

  const k = key();
  const twice = await Promise.all([
    recordBankRefund({ ...base, amountMinor: 500, idempotencyKey: k }, ADMIN),
    recordBankRefund({ ...base, amountMinor: 500, idempotencyKey: k }, ADMIN),
  ]);
  assert.ok(twice.every((x) => x.ok));
  assert.equal(await db.paymentRefundRecord.count({ where: { attemptId: a.id } }), 1);

  assert.equal((await recordBankRefund({ ...base, kind: "REVERSAL", amountMinor: 1590, idempotencyKey: key() }, ADMIN)).ok, false,
    "a full reversal after a partial refund makes no sense");

  // Two different refunds racing for the remaining 15.90 €: only one fits.
  const race = await Promise.all([
    recordBankRefund({ ...base, amountMinor: 1000, idempotencyKey: key() }, ADMIN),
    recordBankRefund({ ...base, amountMinor: 1000, idempotencyKey: key() }, ADMIN),
  ]);
  assert.equal(race.filter((x) => x.ok).length, 1);
  const total = await db.paymentRefundRecord.aggregate({ where: { attemptId: a.id }, _sum: { amountMinor: true } });
  assert.ok((total._sum.amountMinor ?? 0) <= a.amountMinor);
  assert.equal(await db.paymentAuditEvent.count({ where: { orderId: row.id, action: "REFUND_RECORDED" } }), 2);
  assert.equal((await orderRow(row.orderNumber)).paymentStatus, "PAID", "a record moves no money and changes no status");
});

// ── Routes the customer's browser reaches ───────────────────────────────

test("return route: whatever the gateway appends ('paid', amounts) marks nothing", async () => {
  const r = await order("card_online");
  assert.ok((await startCardPayment({ accessToken: r.accessToken!, locale: "en" })).ok);
  const res = await returnRoute(
    new NextRequest(`http://localhost:3999/api/payments/return?t=${r.accessToken}&status=PAID&RC=00&AMOUNT=1`)
  );
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location") ?? "", /\/en\/payment\/return\?t=/);
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "AWAITING_PAYMENT");
});

test("return route: never an open redirect", async () => {
  const res = await returnRoute(new NextRequest("http://localhost:3999/api/payments/return?t=https://evil.example"));
  assert.equal(res.status, 303);
  assert.equal(new URL(res.headers.get("location")!).host, "localhost:3999");
});

test("status endpoint: a wrong token learns nothing; polling is rate-limited per address", async () => {
  const req = (t: string) =>
    statusRoute(new NextRequest(`http://localhost:3999/api/payments/status?t=${t}`, { headers: { "x-forwarded-for": "198.51.100.7" } }));
  const miss = await req("x".repeat(32));
  assert.equal(miss.status, 404);
  assert.deepEqual(await miss.json(), { state: "NOT_FOUND" });
  let limited = 0;
  for (let i = 0; i < 125; i++) if ((await req("y".repeat(32))).status === 429) limited++;
  assert.ok(limited >= 4);
});

test("rate limiter: allows the limit, blocks the rest, opens again after the window", () => {
  const rule = { limit: 3, windowMs: 1000 };
  assert.deepEqual([1, 2, 3, 4].map(() => rateLimit("k", rule, 0)), [true, true, true, false]);
  assert.equal(rateLimit("other", rule, 0), true, "keys are independent");
  assert.equal(rateLimit("k", rule, 1001), true);
});

// ── Nothing claims wallets the bank has not enabled ─────────────────────

test("no Google Pay / Apple Pay button, logo or claim anywhere in the site until it is confirmed", () => {
  const WALLET = /\bapple[\s-]?pay\b|\bgoogle[\s-]?pay\b|\bgpay\b|PaymentRequest\(|pay\.google\.com|apple-developer-merchantid/i;
  const roots = ["app", "components", "messages", "content", "public"];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|json|svg|md|txt)$/.test(name)) {
        const text = readFileSync(p, "utf8");
        if (!WALLET.test(text)) continue;
        // The one allowed mention: the payment terms saying they are NOT offered.
        const negation =
          p === join("content", "legal", "payment.ts") &&
          /не предлагаме[^"]*Apple Pay, Google Pay/.test(text) &&
          /do not[^"]*offer Apple Pay, Google Pay/.test(text);
        if (!negation) hits.push(p);
      } else if (/apple-?pay|\bgpay\b|google-?pay/i.test(name)) hits.push(p);
    }
  };
  roots.forEach(walk);
  assert.deepEqual(hits, []);
});
