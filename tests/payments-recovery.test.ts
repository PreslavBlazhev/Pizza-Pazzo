/**
 * Crash recovery of a confirmed payment — the PAID transition and what
 * follows it (kitchen release, restaurant e-mail).
 *
 * Runs on a fresh temporary SQLite database with the payment simulator
 * (tests/setup-env.mjs), the one environment where a paid order is released
 * to a kitchen board: the board of this throw-away database. Every order here
 * is a TEST order (isTest), so the restaurant e-mail is recorded as SKIPPED —
 * nothing reaches a real kitchen or inbox.
 *
 * Run: npm run test:payments
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import {
  applyProviderStatus,
  completePaidAttempt,
  paymentTestHooks,
  repairPaidAttempts,
  retryFailedNotifications,
  startCardPayment,
  syncAttempt,
  UNSENT_NOTIFICATION_GRACE_MS,
} from "@/lib/payments/service";
import { runPaymentBackgroundOnce } from "@/lib/payments/background";
import { order, quiet, STANDARD_TOTAL_MINOR } from "./helpers";

after(async () => {
  await db.$disconnect();
});
afterEach(() => {
  delete paymentTestHooks.insidePaidTransaction;
  delete paymentTestHooks.afterPaidCommit;
});

const PAID = { state: "PAID" as const, rawStatus: "paid", amountMinor: STANDARD_TOTAL_MINOR, currency: "EUR" };

async function openAttempt() {
  const r = await order("card_online");
  const start = await startCardPayment({ accessToken: r.accessToken!, locale: "bg" });
  assert.equal(start.ok, true, JSON.stringify(start));
  const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { order: { orderNumber: r.orderNumber } } });
  return { r, attempt };
}
const orderOf = (n: number) => db.order.findUniqueOrThrow({ where: { orderNumber: n } });
const attemptOf = (id: string) => db.paymentAttempt.findUniqueOrThrow({ where: { id } });

test("crash INSIDE the PAID transaction: nothing is half-written; the retry completes it once", async () => {
  const { r, attempt } = await openAttempt();
  paymentTestHooks.insidePaidTransaction = () => {
    throw new Error("simulated crash between the attempt and the order update");
  };
  await assert.rejects(quiet(() => applyProviderStatus(attempt, PAID)), /simulated crash/);
  assert.notEqual((await attemptOf(attempt.id)).status, "PAID", "attempt rolled back with the order");
  const mid = await orderOf(r.orderNumber);
  assert.notEqual(mid.paymentStatus, "PAID");
  assert.equal(mid.releasedToKitchenAt, null);

  delete paymentTestHooks.insidePaidTransaction;
  await quiet(async () => applyProviderStatus(await attemptOf(attempt.id), PAID));
  const done = await orderOf(r.orderNumber);
  assert.equal(done.paymentStatus, "PAID");
  assert.ok(done.releasedToKitchenAt, "released");
  assert.equal(done.notificationAttempts, 1, "one e-mail attempt (SKIPPED: test order)");
  assert.equal(done.notificationStatus, "SKIPPED");
});

test("crash AFTER the commit, before the restaurant e-mail: the background run finishes it — exactly once", async () => {
  const { r, attempt } = await openAttempt();
  paymentTestHooks.afterPaidCommit = () => {
    throw new Error("simulated crash before notifying the kitchen");
  };
  await assert.rejects(quiet(() => applyProviderStatus(attempt, PAID)), /simulated crash/);
  delete paymentTestHooks.afterPaidCommit;
  let o = await orderOf(r.orderNumber);
  assert.equal(o.paymentStatus, "PAID");
  assert.ok(o.releasedToKitchenAt, "paid and released in the same transaction");
  assert.equal(o.notificationStatus, null, "the e-mail was never attempted");

  // Within the grace period the normal path is still assumed to be sending.
  await quiet(() => retryFailedNotifications());
  assert.equal((await orderOf(r.orderNumber)).notificationAttempts, 0);

  // "Restart": a later background run (no customer, no board) picks it up.
  await db.order.update({
    where: { id: o.id },
    data: { releasedToKitchenAt: new Date(Date.now() - UNSENT_NOTIFICATION_GRACE_MS - 1000) },
  });
  await quiet(() => runPaymentBackgroundOnce());
  await quiet(() => runPaymentBackgroundOnce());
  o = await orderOf(r.orderNumber);
  assert.equal(o.notificationAttempts, 1, "attempted once, not twice");
  assert.equal(o.notificationStatus, "SKIPPED");
});

test("repeated callbacks / status checks after PAID: one release, one e-mail attempt", async () => {
  const { r, attempt } = await openAttempt();
  await quiet(() => applyProviderStatus(attempt, PAID));
  const first = await orderOf(r.orderNumber);
  for (let i = 0; i < 3; i++) {
    await quiet(async () => applyProviderStatus(await attemptOf(attempt.id), PAID));
    await quiet(() => syncAttempt(attempt.id));
  }
  const o = await orderOf(r.orderNumber);
  assert.equal(o.releasedToKitchenAt?.getTime(), first.releasedToKitchenAt?.getTime());
  assert.equal(o.paidAt?.getTime(), first.paidAt?.getTime());
  assert.equal(o.notificationAttempts, 1);
});

test("five PAID confirmations at the same moment: one transition, one release, one e-mail attempt", async () => {
  const { r, attempt } = await openAttempt();
  await quiet(() => Promise.all(Array.from({ length: 5 }, () => applyProviderStatus(attempt, PAID))));
  const o = await orderOf(r.orderNumber);
  assert.equal(o.paymentStatus, "PAID");
  assert.ok(o.releasedToKitchenAt);
  assert.equal(o.notificationAttempts, 1);
  assert.equal(o.paymentAlert, null, "not mistaken for a duplicate payment");
});

test("older half-written rows (attempt PAID, order unpaid): syncAttempt's PAID exit repairs them — fresh → released, stale → held", async () => {
  // Fresh: as if the old code crashed seconds ago between its two updates.
  const fresh = await openAttempt();
  await db.paymentAttempt.update({ where: { id: fresh.attempt.id }, data: { status: "PAID", finalizedAt: new Date() } });
  await quiet(() => syncAttempt(fresh.attempt.id));
  let o = await orderOf(fresh.r.orderNumber);
  assert.equal(o.paymentStatus, "PAID");
  assert.ok(o.releasedToKitchenAt, "fresh payment: released normally");
  assert.equal(o.notificationAttempts, 1);
  assert.equal(await completePaidAttempt(fresh.attempt.id), null, "a second repair does nothing");

  // Stale: found an hour later — the customer may have given up: held for staff.
  const stale = await openAttempt();
  await db.paymentAttempt.update({
    where: { id: stale.attempt.id },
    data: { status: "PAID", finalizedAt: new Date(Date.now() - 60 * 60_000) },
  });
  assert.equal(await quiet(() => repairPaidAttempts()), 1, "found by the background sweep");
  o = await orderOf(stale.r.orderNumber);
  assert.equal(o.paymentStatus, "PAID");
  assert.equal(o.releasedToKitchenAt, null, "not started automatically");
  assert.equal(o.paymentAlert, "LATE_CONFIRMATION");
  assert.equal(await quiet(() => repairPaidAttempts()), 0, "nothing left to repair");
});

test("concurrent repairs of the same half-written row complete it once", async () => {
  const { r, attempt } = await openAttempt();
  await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "PAID", finalizedAt: new Date() } });
  const outcomes = await quiet(() =>
    Promise.all([completePaidAttempt(attempt.id), completePaidAttempt(attempt.id), syncAttempt(attempt.id)])
  );
  assert.equal(outcomes.filter((x) => x === "RELEASED").length <= 1, true);
  const o = await orderOf(r.orderNumber);
  assert.equal(o.paymentStatus, "PAID");
  assert.equal(o.notificationAttempts, 1);
});
