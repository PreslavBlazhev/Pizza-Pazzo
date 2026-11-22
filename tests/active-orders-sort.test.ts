/**
 * The live board's "В процес" list (accepted orders, with the print buttons)
 * shows the NEWEST order on top — #1085 above #1084 — so staff never mistake
 * a new order for an old one and print it twice.
 *
 * Proven on both layers the board uses: the database query behind
 * /api/admin/pending-orders (getActiveOrders) and the client-side sort in
 * ShiftProvider (sortNewestFirst). The creation time decides, never the
 * moment of acceptance.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { getActiveOrders } from "@/lib/orders";
import { changeOrderStatus } from "@/lib/order-workflow";
import { sortNewestFirst } from "@/lib/order-sort";
import { order } from "./helpers";

after(async () => {
  await db.$disconnect();
});

async function placedAt(iso: string) {
  const r = await order("cash_on_delivery");
  await db.order.update({ where: { id: r.orderId }, data: { createdAt: new Date(iso) } });
  const row = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
  return { id: row.id, orderNumber: row.orderNumber };
}

async function accept(id: string) {
  const r = await changeOrderStatus({ orderId: id, next: "ACCEPTED", estimatedTimeMinutes: 30 });
  assert.ok(r.ok, JSON.stringify(r));
}

const numbers = async () => (await getActiveOrders()).map((o) => o.orderNumber);

test("accepting the new order puts it ABOVE the one already accepted, and it stays there", async () => {
  const older = await placedAt("2026-11-22T10:00:00.000Z"); // "#1084"
  const newer = await placedAt("2026-11-22T10:05:00.000Z"); // "#1085"
  assert.ok(newer.orderNumber > older.orderNumber);

  await accept(older.id);
  assert.deepEqual(await numbers(), [older.orderNumber]);

  await accept(newer.id);
  assert.deepEqual(await numbers(), [newer.orderNumber, older.orderNumber]);

  // A page reload / the next poll reads the same query again: same order.
  assert.deepEqual(await numbers(), [newer.orderNumber, older.orderNumber]);

  // Moving the older order on (a later updatedAt) does not lift it up.
  const step = await changeOrderStatus({ orderId: older.id, next: "PREPARING", expectedStatus: "ACCEPTED" });
  assert.ok(step.ok, JSON.stringify(step));
  assert.deepEqual(await numbers(), [newer.orderNumber, older.orderNumber]);
});

test("an OLDER order accepted after a newer one goes below it — creation time decides", async () => {
  const before = await numbers();
  const old = await placedAt("2026-11-22T11:00:00.000Z");
  const fresh = await placedAt("2026-11-22T11:10:00.000Z");
  await accept(fresh.id);
  await accept(old.id); // accepted last, created first
  assert.deepEqual(await numbers(), [fresh.orderNumber, old.orderNumber, ...before]);
});

test("same creation time: the higher order number is on top", async () => {
  const before = await numbers();
  const a = await placedAt("2026-11-22T12:00:00.000Z");
  const b = await placedAt("2026-11-22T12:00:00.000Z");
  await accept(a.id);
  await accept(b.id);
  assert.deepEqual(await numbers(), [b.orderNumber, a.orderNumber, ...before]);
});

test("sortNewestFirst: newest first, ties by number, and never mutates its input", () => {
  const input = Object.freeze([
    { id: "a", orderNumber: 1083, createdAt: "2026-11-22T09:00:00.000Z" },
    { id: "c", orderNumber: 1085, createdAt: "2026-11-22T09:10:00.000Z" },
    { id: "b", orderNumber: 1084, createdAt: "2026-11-22T09:05:00.000Z" },
    { id: "d", orderNumber: 1086, createdAt: "2026-11-22T09:10:00.000Z" },
  ]);
  const sorted = sortNewestFirst(input);
  assert.deepEqual(sorted.map((o) => o.orderNumber), [1086, 1085, 1084, 1083]);
  assert.notEqual(sorted, input);
  assert.deepEqual(input.map((o) => o.orderNumber), [1083, 1085, 1084, 1086]);
});
