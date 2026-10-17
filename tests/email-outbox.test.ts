/**
 * D. The "order accepted" e-mail: transactional outbox, exactly-once, retries,
 * provider errors, the resend.dev production guard, expiry at 22:30 and the
 * shortened template.
 *
 * Nothing here reaches Resend: the outbox tests inject a sender, and the
 * provider tests stub `fetch` underneath the REAL Resend SDK, so the SDK's own
 * handling of a 403 / 429 / 500 / success is what is tested.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, dbUnscoped } from "@/lib/db";
import { setRetentionClockForTests, setRetentionEnabledForTests } from "@/lib/order-retention";
import { sofiaWallClockToUtc } from "@/lib/report-period";
import { purgeExpiredOrders } from "@/lib/order-purge";
import { placeOrder } from "@/lib/checkout/place-order";
import { changeOrderStatus } from "@/lib/order-workflow";
import {
  MAX_ATTEMPTS,
  SENDING_LEASE_MS,
  drainEmailOutbox,
  providerIdempotencyKey,
  type AcceptedEmailSender,
} from "@/lib/email/outbox";
import { emailJobLabelBg } from "@/lib/email/outbox-status";
import {
  classifyEmailError,
  isResendTestSender,
  sendCustomerOrderAcceptedEmail,
  type EmailOutcome,
} from "@/lib/email/resend";
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import { getOrderById } from "@/lib/orders";
import { SAMPLE_PRINT_ORDER } from "@/lib/printer/sample-order";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, deps, key } from "./helpers";
import type { OrderWithItems } from "@/types/order";

after(async () => {
  setRetentionClockForTests(null);
  await db.$disconnect();
});

const sofia = (y: number, m: number, d: number, h: number, min: number) => sofiaWallClockToUtc(y, m, d, h, min);
const NOON = sofia(2030, 4, 4, 12, 0);

beforeEach(async () => {
  setRetentionClockForTests(NOON);
  await purgeExpiredOrders(sofia(2031, 1, 1, 12, 0));
});

async function acceptedOrder(): Promise<string> {
  const r = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  const a = await changeOrderStatus({ orderId: r.orderId, next: "ACCEPTED", estimatedTimeMinutes: 30, expectedStatus: "PENDING" });
  assert.ok(a.ok && a.changed && a.emailQueued, JSON.stringify(a));
  return r.orderId;
}

function recorder(outcomes: (EmailOutcome | Error)[]) {
  const calls: { orderId: string; key: string; tracking: string | null }[] = [];
  const send: AcceptedEmailSender = async (order, opts) => {
    calls.push({ orderId: order.id, key: opts.idempotencyKey, tracking: opts.trackingUrl });
    const next = outcomes.length > 1 ? outcomes.shift()! : outcomes[0];
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, send };
}

const job = (orderId: string) => dbUnscoped.emailOutbox.findFirstOrThrow({ where: { orderId } });
const later = (ms: number) => new Date(NOON.getTime() + ms);

test("one accept → one queued e-mail → handed to the provider once, with a stable idempotency key", async () => {
  const id = await acceptedOrder();
  const r = recorder([{ status: "sent", id: "re_123" }]);
  const s = await drainEmailOutbox({ send: r.send });
  assert.equal(s.accepted, 1);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].key, providerIdempotencyKey(id));
  assert.match(r.calls[0].tracking ?? "", /\/track#t=/);
  const row = await job(id);
  assert.equal(row.status, "PROVIDER_ACCEPTED");
  assert.equal(row.providerMessageId, "re_123");
  // The kitchen is told the provider accepted it — not that it was delivered.
  assert.match(emailJobLabelBg({ ...row, status: "PROVIDER_ACCEPTED", nextAttemptAt: null }, true), /не гарантира/);
  await drainEmailOutbox({ send: r.send });
  assert.equal(r.calls.length, 1, "a sent e-mail is never sent again");
});

test("double tap and five concurrent 'Приеми': one status change, one e-mail row", async () => {
  const r = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      changeOrderStatus({ orderId: r.orderId, next: "ACCEPTED", estimatedTimeMinutes: 30, expectedStatus: "PENDING" })
    )
  );
  assert.equal(results.filter((x) => x.ok && x.changed).length, 1);
  assert.ok(results.every((x) => x.ok), "the others are told it is already accepted");
  assert.equal(await dbUnscoped.emailOutbox.count({ where: { orderId: r.orderId } }), 1);
  // A screen that still shows "PENDING" after someone else CANCELLED it gets a conflict.
  const other = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  assert.ok(other.ok);
  if (!other.ok) return;
  await changeOrderStatus({ orderId: other.orderId, next: "CANCELLED" });
  const late = await changeOrderStatus({ orderId: other.orderId, next: "ACCEPTED", estimatedTimeMinutes: 30, expectedStatus: "PENDING" });
  assert.equal(late.ok, false);
  assert.ok(!late.ok && late.conflict);
});

test("concurrent workers: the e-mail is handed over exactly once", async () => {
  const id = await acceptedOrder();
  const r = recorder([{ status: "sent" }]);
  await Promise.all(Array.from({ length: 4 }, () => drainEmailOutbox({ send: r.send })));
  assert.equal(r.calls.filter((c) => c.orderId === id).length, 1);
});

test("a temporary failure is retried later with the SAME key; a permanent one is not", async () => {
  const id = await acceptedOrder();
  const r = recorder([{ status: "failed", error: "rate_limit_exceeded 429", kind: "TEMPORARY" }, { status: "sent" }]);
  await drainEmailOutbox({ send: r.send });
  let row = await job(id);
  assert.equal(row.status, "RETRY");
  assert.equal(row.lastErrorKind, "TEMPORARY");
  // Not due yet: nothing happens.
  await drainEmailOutbox({ send: r.send, now: later(5_000) });
  assert.equal(r.calls.length, 1);
  await drainEmailOutbox({ send: r.send, now: later(60_000) });
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[0].key, r.calls[1].key, "the retry is recognisable by the provider");
  row = await job(id);
  assert.equal(row.status, "PROVIDER_ACCEPTED");

  const id2 = await acceptedOrder();
  const p = recorder([{ status: "failed", error: "validation_error 422 invalid `to`", kind: "PERMANENT" }]);
  await drainEmailOutbox({ send: p.send });
  await drainEmailOutbox({ send: p.send, now: later(3_600_000) });
  assert.equal(p.calls.length, 1);
  const row2 = await job(id2);
  assert.equal(row2.status, "FAILED");
  assert.match(emailJobLabelBg({ ...row2, status: "FAILED", nextAttemptAt: null }, true), /НЕ Е ИЗПРАТЕН/);
});

test("a timeout (the message may have gone) and a dead worker are retried with the same key", async () => {
  const id = await acceptedOrder();
  const r = recorder([new Error("timeout after 15000 ms"), { status: "sent" }]);
  await drainEmailOutbox({ send: r.send });
  assert.equal((await job(id)).status, "RETRY");
  await drainEmailOutbox({ send: r.send, now: later(60_000) });
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[0].key, r.calls[1].key);

  // A worker died after claiming: the row is stuck in SENDING until its lease runs out.
  const id2 = await acceptedOrder();
  await dbUnscoped.emailOutbox.updateMany({ where: { orderId: id2 }, data: { status: "SENDING", claimedAt: NOON, attempts: 1 } });
  const w = recorder([{ status: "sent" }]);
  await drainEmailOutbox({ send: w.send, now: later(SENDING_LEASE_MS / 2) });
  assert.equal(w.calls.length, 0, "a live lease is respected");
  await drainEmailOutbox({ send: w.send, now: later(SENDING_LEASE_MS + 1_000) });
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].key, providerIdempotencyKey(id2));
});

test("temporary failures stop after MAX_ATTEMPTS", async () => {
  const id = await acceptedOrder();
  const r = recorder([{ status: "failed", error: "500", kind: "TEMPORARY" }]);
  for (let i = 0; i < MAX_ATTEMPTS + 3; i++) {
    await drainEmailOutbox({ send: r.send, now: later((i + 1) * 3_600_000) });
  }
  assert.equal(r.calls.length, MAX_ATTEMPTS);
  assert.equal((await job(id)).status, "FAILED");
});

test("history kept: a retry after 22:30 (and the next day) still sends, and deletes nothing", async () => {
  const id = await acceptedOrder();
  // The first attempt fails temporarily; the retry comes after 22:30.
  const first = recorder([{ status: "failed", kind: "TEMPORARY", error: "timeout" }]);
  await drainEmailOutbox({ send: first.send });
  assert.equal(first.calls.length, 1);
  setRetentionClockForTests(sofia(2030, 4, 5, 9, 0));
  const later = recorder([{ status: "sent", id: "re_late" }]);
  await drainEmailOutbox({ send: later.send, now: sofia(2030, 4, 5, 9, 0) });
  assert.equal(later.calls.length, 1, "the retry is sent — the order is kept");
  const job = await dbUnscoped.emailOutbox.findFirst({ where: { orderId: id } });
  assert.equal(job?.status, "PROVIDER_ACCEPTED");
  assert.equal(await dbUnscoped.order.count({ where: { id } }), 1, "the order is still there");
  const purge = await purgeExpiredOrders();
  assert.equal(purge.disabled, true);
  assert.equal(await dbUnscoped.order.count({ where: { id } }), 1);
  assert.equal(await dbUnscoped.emailOutbox.count({ where: { orderId: id } }), 1);
});

test("dormant design (retention ON): the e-mail job expires with the order at 22:30 — not sent, then deleted", async () => {
  setRetentionEnabledForTests(true);
  try {
    const id = await acceptedOrder();
    setRetentionClockForTests(sofia(2030, 4, 4, 22, 30));
    const r = recorder([{ status: "sent" }]);
    await drainEmailOutbox({ send: r.send });
    assert.equal(r.calls.length, 0);
    await purgeExpiredOrders();
    assert.equal(await dbUnscoped.emailOutbox.count({ where: { orderId: id } }), 0);
  } finally {
    setRetentionEnabledForTests(false);
  }
});

// ── The real Resend SDK, with fetch stubbed ─────────────────────────────────

async function withProvider<T>(
  env: Record<string, string>,
  respond: (body: unknown) => Response | Promise<Response>,
  run: () => Promise<T>
): Promise<{ result: T; requests: { headers: Record<string, string>; body: Record<string, unknown> }[] }> {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  const requests: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  Object.assign(process.env, env);
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    requests.push({ headers, body });
    return respond(body);
  }) as typeof fetch;
  try {
    return { result: await run(), requests };
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const sampleOrder = (): OrderWithItems => ({ ...SAMPLE_PRINT_ORDER, items: SAMPLE_PRINT_ORDER.items! });
const PROVIDER_ENV = { RESEND_API_KEY: "re_test_not_real", FROM_EMAIL: "Pizza Pazzo <orders@pizzapazzo.bg>" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("provider: success returns the message id; the idempotency key is sent", async () => {
  const { result, requests } = await withProvider(PROVIDER_ENV, () => json(200, { id: "msg_1" }), () =>
    sendCustomerOrderAcceptedEmail(sampleOrder(), { idempotencyKey: "pp-accepted-x" })
  );
  assert.deepEqual(result, { status: "sent", id: "msg_1" });
  assert.equal(requests[0].headers["idempotency-key"], "pp-accepted-x");
  assert.equal(requests[0].body.to, SAMPLE_PRINT_ORDER.customerEmail);
});

test("provider: the resend.dev 403 is returned as an error (not success) and classified CONFIG", async () => {
  const { result } = await withProvider(
    { ...PROVIDER_ENV, FROM_EMAIL: "onboarding@resend.dev" },
    () =>
      json(403, {
        statusCode: 403,
        name: "validation_error",
        message: "You can only send testing emails to your own email address. To send to other recipients, please verify a domain.",
      }),
    () => sendCustomerOrderAcceptedEmail(sampleOrder())
  );
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.kind, "CONFIG");
});

test("provider: 429 and 500 are TEMPORARY, 422 is PERMANENT, a network error is TEMPORARY", async () => {
  for (const [status, name, kind] of [
    [429, "rate_limit_exceeded", "TEMPORARY"],
    [500, "application_error", "TEMPORARY"],
    [422, "validation_error", "PERMANENT"],
  ] as const) {
    const { result } = await withProvider(PROVIDER_ENV, () => json(status, { statusCode: status, name, message: name }), () =>
      sendCustomerOrderAcceptedEmail(sampleOrder())
    );
    assert.equal(result.status === "failed" && result.kind, kind, `${status} ${name}`);
  }
  const { result } = await withProvider(PROVIDER_ENV, () => Promise.reject(new TypeError("fetch failed")), () =>
    sendCustomerOrderAcceptedEmail(sampleOrder())
  );
  assert.equal(result.status === "failed" && result.kind, "TEMPORARY");
  assert.equal(classifyEmailError({ name: "invalid_api_key", statusCode: 403 }), "CONFIG");
  assert.equal(classifyEmailError(undefined), "TEMPORARY");
});

test("production never sends customer e-mail from the resend.dev test sender (no request is made)", async () => {
  assert.equal(isResendTestSender("onboarding@resend.dev"), true);
  assert.equal(isResendTestSender("Pizza Pazzo <onboarding@resend.dev>"), true);
  assert.equal(isResendTestSender("Pizza Pazzo <orders@pizzapazzo.bg>"), false);
  const { result, requests } = await withProvider(
    { ...PROVIDER_ENV, FROM_EMAIL: "onboarding@resend.dev", APP_ENV: "production" },
    () => json(200, { id: "never" }),
    () => sendCustomerOrderAcceptedEmail(sampleOrder())
  );
  assert.equal(requests.length, 0);
  assert.equal(result.status === "failed" && result.kind, "CONFIG");
});

// ── The template ────────────────────────────────────────────────────────────

test("template: the merchant/terms/withdrawal block is gone; the useful parts are there", () => {
  const order = sampleOrder();
  const mail = customerOrderAcceptedEmail(order, { phone: "064 801 999", trackingUrl: "https://pizzapazzo.bg/track#t=abc" });
  for (const part of [mail.html, mail.text]) {
    for (const gone of ["Търговец", "ЕИК", "ДДС", "Седалище", "Приети условия", "версия", "Право на отказ", "Рекламации", "ЗЗП"]) {
      assert.ok(!part.includes(gone), `"${gone}" must not be in the e-mail`);
    }
    for (const kept of [
      "Pizza Pazzo",
      `#${order.orderNumber}`,
      "приета",
      "Маргарита",
      "Кашкавален борд",
      "Оферта 2 пици 40 + 30 см: 19.43 € (редовно 22.49 €)",
      `${order.totalEur.toFixed(2)} €`,
      "в брой при доставка",
      "Доставка до адрес",
      order.deliveryAddress,
      order.deliveryNote!,
      "около 30 минути",
      "064 801 999",
    ]) {
      assert.ok(part.includes(kept), `"${kept}" missing`);
    }
  }
  assert.ok(mail.html.includes('href="https://pizzapazzo.bg/track#t=abc"'));
  assert.ok(mail.html.includes("Проследи поръчката"));
  assert.ok(mail.text.includes("Проследете поръчката: https://pizzapazzo.bg/track#t=abc"));
  assert.ok(!/<img/i.test(mail.html), "works without images");
  assert.ok(mail.html.includes("max-width:560px"), "one narrow column for phones");
});

test("template: a pickup order has no address; everything the customer typed is escaped", () => {
  const evil = '<script>alert("x")</script> & \'quote\'';
  const order: OrderWithItems = {
    ...sampleOrder(),
    deliveryMethod: "PICKUP",
    customerName: evil,
    deliveryNote: evil,
    items: sampleOrder().items.map((i, idx) => (idx === 0 ? { ...i, itemNote: evil } : i)),
  };
  const mail = customerOrderAcceptedEmail(order, { phone: "064 801 999" });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.html.includes("&#39;quote&#39;"));
  assert.ok(!mail.html.includes(SAMPLE_PRINT_ORDER.deliveryAddress));
  assert.ok(!mail.text.includes("Адрес за доставка"));
  assert.ok(mail.text.includes("Вземане от ресторанта"));
  assert.ok(!mail.html.includes("Проследи поръчката"), "no button without a link");
});

test("the outbox renders from the saved order (number, items, total) at send time", async () => {
  const id = await acceptedOrder();
  const order = await getOrderById(id);
  let rendered = "";
  await drainEmailOutbox({
    send: async (o) => {
      rendered = customerOrderAcceptedEmail(o, { phone: "064" }).text;
      return { status: "sent" };
    },
  });
  assert.ok(rendered.includes(`#${order!.orderNumber}`));
  assert.ok(rendered.includes(`Обща сума: ${order!.totalEur.toFixed(2)} €`));
});
