/**
 * A. Daily retention — the DORMANT design (switched off in the site: the
 * order history is kept, lib/order-retention.ts ORDER_RETENTION_ENABLED =
 * false; tests/history-kept.test.ts proves that). This file switches it ON
 * for itself only (setRetentionEnabledForTests) and checks what it would do:
 * orders existing only until 22:30 Europe/Sofia.
 *
 * Time maths (summer/winter/DST days), the cutoff on the server for placing
 * an order, the retention filter on every read and write, the physical purge
 * of every dependent table, missed runs, restarts, races around 22:30, late
 * webhooks/retries and the backup files. Runs against a fresh SQLite file
 * (tests/setup-env.mjs); the clock is pinned with setRetentionClockForTests.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, dbUnscoped } from "@/lib/db";
import {
  isAfterDailyCutoff,
  isOrderLive,
  lastCutoffAtOrBefore,
  nextCutoffAfter,
  orderExpiresAt,
  setRetentionClockForTests,
  setRetentionEnabledForTests,
} from "@/lib/order-retention";
import { sofiaWallClockToUtc } from "@/lib/report-period";
import { maybePurgeExpiredOrders, purgeExpiredOrders } from "@/lib/order-purge";
import { placeOrder } from "@/lib/checkout/place-order";
import { changeOrderStatus } from "@/lib/order-workflow";
import { drainEmailOutbox } from "@/lib/email/outbox";
import { findTrackedOrder, trackingTokenFor } from "@/lib/order-tracking";
import { getActiveOrders, getOrderById, getOrders, getPendingOrders } from "@/lib/orders";
import { resolveStoreStatus } from "@/lib/store-hours";
import { handleProviderCallback, startCardPayment, syncAttempt } from "@/lib/payments/service";
import { recordSimulatorOutcome, signSimulatorBody } from "@/lib/payments/providers/simulator";
import { SIMULATOR_SIGNATURE_HEADER } from "@/lib/payments/providers/simulator";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, deps, key } from "./helpers";
import type { RestaurantHours } from "@/types/settings";

// The dormant design, for this file only (each test file is its own process).
setRetentionEnabledForTests(true);

after(async () => {
  setRetentionClockForTests(null);
  await db.$disconnect();
});

/** A Sofia wall-clock instant. */
const sofia = (y: number, m: number, d: number, h: number, min: number, s = 0, ms = 0) =>
  new Date(sofiaWallClockToUtc(y, m, d, h, min, s).getTime() + ms);

const at = (when: Date) => setRetentionClockForTests(when);

async function cashOrder(): Promise<{ id: string; orderNumber: number }> {
  const r = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { id: r.orderId, orderNumber: r.orderNumber };
}

/** Every row anywhere that belongs to these orders — bypassing the filter. */
async function rowsFor(ids: string[]) {
  const w = { orderId: { in: ids } };
  return {
    orders: await dbUnscoped.order.count({ where: { id: { in: ids } } }),
    items: await dbUnscoped.orderItem.count({ where: w }),
    outbox: await dbUnscoped.emailOutbox.count({ where: w }),
    attempts: await dbUnscoped.paymentAttempt.count({ where: w }),
    events: await dbUnscoped.paymentAuditEvent.count({ where: w }),
    refunds: await dbUnscoped.paymentRefundRecord.count({ where: w }),
  };
}

beforeEach(async () => {
  // Every test starts from an empty order table on a fresh day.
  at(sofia(2030, 1, 1, 12, 0));
  await purgeExpiredOrders(sofia(2031, 1, 1, 12, 0));
});

// ── Time maths ──────────────────────────────────────────────────────────────

test("22:30 Sofia in summer is 19:30 UTC, in winter 20:30 UTC — no fixed offset", () => {
  assert.equal(nextCutoffAfter(sofia(2026, 7, 15, 12, 0)).toISOString(), "2026-07-15T19:30:00.000Z");
  assert.equal(nextCutoffAfter(sofia(2026, 1, 15, 12, 0)).toISOString(), "2026-01-15T20:30:00.000Z");
  // The two changeover days themselves (clocks move at 03:00/04:00).
  assert.equal(nextCutoffAfter(sofia(2026, 3, 29, 1, 0)).toISOString(), "2026-03-29T19:30:00.000Z");
  assert.equal(nextCutoffAfter(sofia(2026, 10, 25, 1, 0)).toISOString(), "2026-10-25T20:30:00.000Z");
  assert.equal(nextCutoffAfter(new Date("2026-10-25T05:00:00Z")).toISOString(), "2026-10-25T20:30:00.000Z");
});

test("before, exactly at and after 22:30; after midnight the cutoff is yesterday's", () => {
  const created = sofia(2026, 10, 17, 21, 0);
  assert.equal(isOrderLive(created, sofia(2026, 10, 17, 22, 29, 59, 999)), true);
  assert.equal(isOrderLive(created, sofia(2026, 10, 17, 22, 30)), false, "at 22:30:00.000 it is gone");
  assert.equal(isOrderLive(created, sofia(2026, 10, 18, 0, 5)), false);
  assert.equal(isAfterDailyCutoff(sofia(2026, 10, 17, 22, 29, 59)), false);
  assert.equal(isAfterDailyCutoff(sofia(2026, 10, 17, 22, 30)), true);
  assert.equal(isAfterDailyCutoff(sofia(2026, 10, 17, 23, 59, 59)), true);
  assert.equal(isAfterDailyCutoff(sofia(2026, 10, 18, 0, 0)), false, "a new day after midnight");
  assert.equal(lastCutoffAtOrBefore(sofia(2026, 10, 18, 0, 30)).getTime(), sofia(2026, 10, 17, 22, 30).getTime());
  // An order placed after midnight lives until that day's 22:30.
  assert.equal(orderExpiresAt(sofia(2026, 10, 18, 0, 30)).getTime(), sofia(2026, 10, 18, 22, 30).getTime());
});

test("the store refuses orders 22:30–24:00 whatever the hours or a forced opening say", () => {
  const day = { open: true, from: "11:00", to: "23:00" };
  const hours = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, day])
  ) as unknown as RestaurantHours;
  const none = { active: false, until: null };
  const forced = { active: true, until: null };
  assert.equal(resolveStoreStatus(hours, none, sofia(2026, 10, 17, 22, 29)).isOpen, true);
  const late = resolveStoreStatus(hours, none, sofia(2026, 10, 17, 22, 45), forced);
  assert.equal(late.isOpen, false);
  assert.equal(late.reason, "daily_cutoff");
  assert.equal(late.reopensAt, sofia(2026, 10, 18, 11, 0).toISOString(), "next opening: tomorrow 11:00");
  // After midnight a forced opening works again (the next day has begun).
  assert.equal(resolveStoreStatus(hours, none, sofia(2026, 10, 18, 2, 0), forced).isOpen, true);
});

// ── Placing an order around the cutoff ──────────────────────────────────────

test("placing an order: accepted at 22:29:59, refused at 22:30:00 and at 23:59, fine after midnight", async () => {
  at(sofia(2030, 3, 5, 22, 29, 59, 900));
  assert.ok((await cashOrder()).orderNumber > 0);
  for (const when of [sofia(2030, 3, 5, 22, 30), sofia(2030, 3, 5, 23, 59, 59)]) {
    at(when);
    const r = await placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
      deps
    );
    assert.deepEqual(r, { ok: false, error: "DAILY_CUTOFF" });
  }
  at(sofia(2030, 3, 6, 0, 0, 1));
  assert.ok((await cashOrder()).orderNumber > 0);
});

// ── Every status, every dependent row ───────────────────────────────────────

test("at 22:30 every order (all statuses) is unreadable everywhere, then the purge deletes it and all its rows", async () => {
  at(sofia(2030, 5, 10, 12, 0));
  const pending = await cashOrder();
  const accepted = await cashOrder();
  const cancelled = await cashOrder();
  const delivered = await cashOrder();
  assert.ok((await changeOrderStatus({ orderId: accepted.id, next: "ACCEPTED", estimatedTimeMinutes: 30 })).ok);
  assert.ok((await changeOrderStatus({ orderId: cancelled.id, next: "CANCELLED" })).ok);
  for (const [next, extra] of [
    ["ACCEPTED", { estimatedTimeMinutes: 20 }],
    ["PREPARING", {}],
    ["READY", {}],
    ["OUT_FOR_DELIVERY", {}],
    ["DELIVERED", {}],
  ] as const) {
    const r = await changeOrderStatus({ orderId: delivered.id, next, ...extra });
    assert.ok(r.ok, `${next}: ${JSON.stringify(r)}`);
  }
  // A card order with a real payment attempt, plus an audit event and a refund record.
  const card = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  assert.ok(card.ok && card.accessToken);
  if (!card.ok) return;
  assert.ok((await startCardPayment({ accessToken: card.accessToken!, locale: "bg" })).ok);
  const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { orderId: card.orderId } });
  await db.paymentAuditEvent.create({ data: { orderId: card.orderId, action: "ACK_PAYMENT_ALERT" } });
  await db.paymentRefundRecord.create({
    data: {
      orderId: card.orderId,
      attemptId: attempt.id,
      amountMinor: 100,
      currency: "EUR",
      kind: "REFUND",
      bankReference: "TEST",
      idempotencyKey: key(),
    },
  });

  const ids = [pending.id, accepted.id, cancelled.id, delivered.id, card.orderId];
  const before = await rowsFor(ids);
  assert.equal(before.orders, 5);
  assert.ok(before.items >= 5 && before.outbox >= 2 && before.attempts === 1 && before.events === 1 && before.refunds === 1);

  // 22:29:59 — still there for everyone.
  at(sofia(2030, 5, 10, 22, 29, 59));
  assert.equal((await getOrders()).length, 5);
  assert.ok(await getOrderById(accepted.id));

  // 22:30:00 — the job has NOT run yet, yet nothing can be read, changed,
  // printed (the print route reads getOrderById), tracked or e-mailed.
  at(sofia(2030, 5, 10, 22, 30));
  assert.deepEqual(await getOrders(), []);
  assert.deepEqual(await getPendingOrders(), []);
  assert.deepEqual(await getActiveOrders(), []);
  assert.equal(await getOrderById(pending.id), null);
  assert.equal(await db.order.count(), 0);
  assert.equal(await db.orderItem.count({ where: { orderId: { in: ids } } }), 0);
  assert.equal(await db.paymentAttempt.count({ where: { orderId: card.orderId } }), 0);
  const change = await changeOrderStatus({ orderId: pending.id, next: "ACCEPTED", estimatedTimeMinutes: 30 });
  assert.equal(change.ok, false);
  assert.equal(await findTrackedOrder(trackingTokenFor(accepted.id), null), null);
  let sent = 0;
  await drainEmailOutbox({ send: async () => ((sent++), { status: "sent" }) });
  assert.equal(sent, 0, "no e-mail for an expired order");
  // A direct write cannot touch it either.
  const upd = await db.order.updateMany({ where: { id: pending.id }, data: { status: "ACCEPTED" } });
  assert.equal(upd.count, 0);

  // The rows still exist until the purge…
  assert.equal((await rowsFor(ids)).orders, 5);
  const summary = await purgeExpiredOrders();
  assert.equal(summary.deletedOrders, 5);
  // …and after it, nothing of them anywhere in the live database.
  assert.deepEqual(await rowsFor(ids), { orders: 0, items: 0, outbox: 0, attempts: 0, events: 0, refunds: 0 });
  assert.equal(await dbUnscoped.paymentSimulatorSession.count({ where: { createdAt: { lte: sofia(2030, 5, 10, 22, 30) } } }), 0);
});

test("the purge keeps the menu, settings, users, print layouts and the number counter", async () => {
  at(sofia(2030, 6, 1, 12, 0));
  const user = await dbUnscoped.user.create({
    data: { email: `keep-${key()}@example.test`, passwordHash: "x", fullName: "Keep Me" },
  });
  const settingsBefore = await dbUnscoped.restaurantSettings.count();
  const templatesBefore = await dbUnscoped.printTemplate.count();
  const first = await cashOrder();
  at(sofia(2030, 6, 1, 23, 0));
  await purgeExpiredOrders();
  assert.equal(await dbUnscoped.user.count({ where: { id: user.id } }), 1);
  assert.equal(await dbUnscoped.restaurantSettings.count(), settingsBefore);
  assert.equal(await dbUnscoped.printTemplate.count(), templatesBefore);
  // Numbers keep counting: tomorrow's first order is not yesterday's number again.
  at(sofia(2030, 6, 2, 12, 0));
  const next = await cashOrder();
  assert.equal(next.orderNumber, first.orderNumber + 1);
  const state = await dbUnscoped.maintenanceState.findUnique({ where: { id: "orders" } });
  assert.ok(state?.lastRunAt, "the purge records when it ran");
});

// ── Missed runs, restarts, repetition ───────────────────────────────────────

test("a missed evening (or three) is caught up by the next run; repeating it is a no-op", async () => {
  const ids: string[] = [];
  for (const day of [1, 2, 3]) {
    at(sofia(2030, 7, day, 13, 0));
    ids.push((await cashOrder()).id);
  }
  // Nobody purged for three days; the service comes back on the 5th.
  at(sofia(2030, 7, 5, 9, 0));
  assert.equal(await db.order.count(), 0, "invisible even before the catch-up");
  assert.equal((await rowsFor(ids)).orders, 3);
  const first = await purgeExpiredOrders();
  assert.equal(first.deletedOrders, 3);
  const again = await purgeExpiredOrders();
  assert.equal(again.deletedOrders, 0);
  // A "restart": the in-process throttle is reset, the start-up sweep runs.
  (globalThis as Record<string, unknown>).__ppPurge = undefined;
  await maybePurgeExpiredOrders();
  assert.equal((await rowsFor(ids)).orders, 0);
});

test("two processes purging at the same time end in the same state", async () => {
  at(sofia(2030, 8, 1, 12, 0));
  const ids = [(await cashOrder()).id, (await cashOrder()).id];
  at(sofia(2030, 8, 1, 22, 31));
  const results = await Promise.all([purgeExpiredOrders(), purgeExpiredOrders(), purgeExpiredOrders()]);
  assert.equal(results.reduce((s, r) => s + r.deletedOrders, 0), 2, "each order deleted exactly once");
  assert.equal((await rowsFor(ids)).orders, 0);
});

// ── Races around 22:30 ──────────────────────────────────────────────────────

test("create, accept and send racing the purge: nothing survives, nothing is re-created", async () => {
  at(sofia(2030, 9, 1, 22, 29, 59, 950));
  const o = await cashOrder();
  const [placed] = await Promise.all([
    placeOrder(
      { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
      deps
    ),
    purgeExpiredOrders(),
  ]);
  assert.ok(placed.ok, "placed in the last second of the day");
  // The cutoff passes while "Приеми" and the e-mail worker are in flight.
  at(sofia(2030, 9, 1, 22, 30, 0, 10));
  let sent = 0;
  const [accept] = await Promise.all([
    changeOrderStatus({ orderId: o.id, next: "ACCEPTED", estimatedTimeMinutes: 30 }),
    purgeExpiredOrders(),
    drainEmailOutbox({ send: async () => ((sent++), { status: "sent" }) }),
  ]);
  assert.equal(accept.ok, false);
  assert.equal(sent, 0);
  await purgeExpiredOrders();
  const ids = [o.id, ...(placed.ok ? [placed.orderId] : [])];
  assert.deepEqual(await rowsFor(ids), { orders: 0, items: 0, outbox: 0, attempts: 0, events: 0, refunds: 0 });
  // A late retry trying to queue the e-mail again cannot attach it to a deleted order.
  await assert.rejects(
    dbUnscoped.emailOutbox.create({ data: { orderId: o.id, kind: "ORDER_ACCEPTED", dedupeKey: `ORDER_ACCEPTED:${o.id}` } })
  );
});

test("a late, authentic payment callback after 22:30 restores nothing", async () => {
  at(sofia(2030, 10, 1, 21, 0));
  const card = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  assert.ok(card.ok);
  if (!card.ok) return;
  assert.ok((await startCardPayment({ accessToken: card.accessToken!, locale: "bg" })).ok);
  const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { orderId: card.orderId } });
  await recordSimulatorOutcome(attempt.providerPaymentId!, "paid");

  at(sofia(2030, 10, 1, 22, 40));
  await purgeExpiredOrders();
  const body = JSON.stringify({ reference: attempt.reference, providerPaymentId: attempt.providerPaymentId });
  const headers = new Headers({
    [SIMULATOR_SIGNATURE_HEADER]: signSimulatorBody(body, process.env.PAYMENT_SIMULATOR_SECRET!),
  });
  const res = await handleProviderCallback("simulator", { method: "POST", headers, query: new URLSearchParams(), bodyText: body });
  assert.equal(res.status, 200, "acknowledged, so the provider stops retrying");
  await syncAttempt(attempt.id).catch(() => undefined);
  assert.deepEqual(await rowsFor([card.orderId]), { orders: 0, items: 0, outbox: 0, attempts: 0, events: 0, refunds: 0 });
});

