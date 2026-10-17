/**
 * E. Order tracking: the status flows per delivery method, staff transitions
 * and conflicts, and who may see what with which token.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, dbUnscoped } from "@/lib/db";
import { setRetentionClockForTests } from "@/lib/order-retention";
import { sofiaWallClockToUtc } from "@/lib/report-period";
import { purgeExpiredOrders } from "@/lib/order-purge";
import { placeOrder } from "@/lib/checkout/place-order";
import { changeOrderStatus } from "@/lib/order-workflow";
import { ORDER_STATUS_FLOW, PICKUP_STATUS_FLOW, canTransition } from "@/lib/order-status";
import {
  addToTrackCookie,
  findTrackedOrder,
  listTrackedOrders,
  parseTrackCookie,
  trackingTokenFor,
  trackingUrlFor,
  verifyTrackingToken,
} from "@/lib/order-tracking";
import { ORDER_STATUSES, type OrderStatus } from "@/types/order";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, deps, key } from "./helpers";

after(async () => {
  setRetentionClockForTests(null);
  await db.$disconnect();
});

const sofia = (y: number, m: number, d: number, h: number, min: number) => sofiaWallClockToUtc(y, m, d, h, min);

beforeEach(async () => {
  setRetentionClockForTests(sofia(2030, 2, 2, 12, 0));
  await purgeExpiredOrders(sofia(2031, 1, 1, 12, 0));
});

async function newOrder(userId: string | null = null): Promise<{ id: string; orderNumber: number }> {
  const r = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId, consents: ALL_CONSENTS },
    deps
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { id: r.orderId, orderNumber: r.orderNumber };
}

async function user(): Promise<string> {
  const u = await dbUnscoped.user.create({ data: { email: `u-${key()}@example.test`, passwordHash: "x", fullName: "U" } });
  return u.id;
}

// ── Status flows ────────────────────────────────────────────────────────────

test("delivery: Изпратена → Приета/Приготвя се → Готова → В доставка → Доставена; cancel only before 'Готова'", () => {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ["ACCEPTED", "CANCELLED"],
    ACCEPTED: ["PREPARING", "CANCELLED"],
    PREPARING: ["READY", "CANCELLED"],
    READY: ["OUT_FOR_DELIVERY"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
  };
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      assert.equal(canTransition(from, to, "DELIVERY"), allowed[from].includes(to), `DELIVERY ${from} → ${to}`);
    }
  }
  assert.deepEqual(ORDER_STATUS_FLOW, allowed);
});

test("pickup: no delivery step — Готова за получаване → Получена", () => {
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      const expected =
        from === "READY" ? to === "DELIVERED" : from === "OUT_FOR_DELIVERY" ? false : ORDER_STATUS_FLOW[from].includes(to);
      assert.equal(canTransition(from, to, "PICKUP"), expected, `PICKUP ${from} → ${to}`);
    }
  }
  assert.deepEqual(PICKUP_STATUS_FLOW.READY, ["DELIVERED"]);
});

test("staff walk a delivery through every step; skipping or going back is refused", async () => {
  const o = await newOrder();
  const step = (next: OrderStatus, expectedStatus?: OrderStatus) =>
    changeOrderStatus({ orderId: o.id, next, expectedStatus, estimatedTimeMinutes: 25 });
  assert.equal((await step("READY")).ok, false, "cannot skip to READY");
  for (const [next, from] of [
    ["ACCEPTED", "PENDING"],
    ["PREPARING", "ACCEPTED"],
    ["READY", "PREPARING"],
  ] as const) {
    assert.ok((await step(next, from)).ok, next);
  }
  assert.equal((await step("DELIVERED", "READY")).ok, false, "a delivery must go 'В доставка' first");
  assert.ok((await step("OUT_FOR_DELIVERY", "READY")).ok);
  assert.ok((await step("DELIVERED", "OUT_FOR_DELIVERY")).ok);
  assert.equal((await step("PREPARING", "DELIVERED")).ok, false, "never back from a final state");
});

test("a pickup order: READY → 'Получена' directly; 'В доставка' is refused", async () => {
  const o = await newOrder();
  await db.order.update({ where: { id: o.id }, data: { deliveryMethod: "PICKUP" } });
  for (const next of ["ACCEPTED", "PREPARING", "READY"] as const) {
    assert.ok((await changeOrderStatus({ orderId: o.id, next, estimatedTimeMinutes: 15 })).ok, next);
  }
  assert.equal((await changeOrderStatus({ orderId: o.id, next: "OUT_FOR_DELIVERY" })).ok, false);
  assert.ok((await changeOrderStatus({ orderId: o.id, next: "DELIVERED" })).ok);
  const tracked = await findTrackedOrder(trackingTokenFor(o.id), null);
  assert.equal(tracked?.deliveryMethod, "PICKUP");
  assert.equal(tracked?.status, "DELIVERED");
});

test("two screens press different steps at once: one wins, the other gets a conflict", async () => {
  const o = await newOrder();
  const [a, b] = await Promise.all([
    changeOrderStatus({ orderId: o.id, next: "ACCEPTED", expectedStatus: "PENDING", estimatedTimeMinutes: 30 }),
    changeOrderStatus({ orderId: o.id, next: "CANCELLED", expectedStatus: "PENDING" }),
  ]);
  const wins = [a, b].filter((r) => r.ok && r.changed);
  assert.equal(wins.length, 1);
  const lose = [a, b].find((r) => !(r.ok && r.changed))!;
  assert.equal(lose.ok, false);
  assert.ok(!lose.ok && lose.conflict, "told that another screen moved it");
});

// ── Access ──────────────────────────────────────────────────────────────────

test("a guest with the token sees the order; nothing personal is in the answer", async () => {
  const o = await newOrder();
  const token = trackingTokenFor(o.id)!;
  assert.match(token, /^[a-z0-9]{20,40}\.[A-Za-z0-9_-]{43}$/, "order id + 256-bit MAC");
  const t = await findTrackedOrder(token, null);
  assert.ok(t);
  assert.deepEqual(Object.keys(t!).sort(), [
    "acceptedAt",
    "createdAt",
    "deliveryMethod",
    "estimatedTimeMinutes",
    "expiresAt",
    "isTest",
    "orderNumber",
    "status",
    "token",
    "updatedAt",
  ]);
  const raw = JSON.stringify(t);
  for (const secret of [CONTACT.customerName, CONTACT.customerEmail, CONTACT.customerPhone, CONTACT.deliveryAddress]) {
    assert.ok(!raw.includes(secret), `"${secret}" must not be in the answer`);
  }
  assert.equal(t!.expiresAt, sofia(2030, 2, 2, 22, 30).toISOString());
  assert.match(trackingUrlFor(o.id) ?? "", /\/track#t=/, "the e-mail link carries the token in the fragment");
});

test("forged, truncated, swapped, malformed and wrong tokens all get the same nothing", async () => {
  const a = await newOrder();
  const b = await newOrder();
  const ta = trackingTokenFor(a.id)!;
  const tb = trackingTokenFor(b.id)!;
  const [, macB] = tb.split(".");
  for (const bad of [
    `${a.id}.${macB}`, // a's id with b's MAC — the order number/id alone proves nothing
    ta.slice(0, -1),
    `${ta.slice(0, -1)}${ta.endsWith("A") ? "B" : "A"}`,
    String(a.orderNumber),
    a.id,
    "",
    null,
    "x".repeat(200),
    `${a.id}.${"A".repeat(43)}`,
  ]) {
    assert.equal(verifyTrackingToken(bad), null, `token ${String(bad).slice(0, 30)}`);
    assert.equal(await findTrackedOrder(bad, null), null);
  }
});

test("signed-in: own orders without a token; another account is refused even WITH the token", async () => {
  const owner = await user();
  const stranger = await user();
  const mine = await newOrder(owner);
  const token = trackingTokenFor(mine.id)!;
  const list = await listTrackedOrders([], owner);
  assert.deepEqual(list.map((o) => o.orderNumber), [mine.orderNumber]);
  assert.equal(await findTrackedOrder(token, stranger), null);
  assert.deepEqual(await listTrackedOrders([token], stranger), []);
  // The owner's e-mail link opened on a device where nobody is signed in works.
  assert.equal((await findTrackedOrder(token, null))?.orderNumber, mine.orderNumber);
});

test("more than one current order: all are listed, newest first, cookie capped at 5", async () => {
  const tokens: string[] = [];
  let cookie = "";
  for (let i = 0; i < 3; i++) {
    setRetentionClockForTests(sofia(2030, 2, 2, 12, 10 + i));
    const o = await newOrder();
    const t = trackingTokenFor(o.id)!;
    tokens.push(t);
    cookie = addToTrackCookie(parseTrackCookie(cookie), t);
  }
  const list = await listTrackedOrders(parseTrackCookie(cookie), null);
  assert.equal(list.length, 3);
  assert.ok(list[0].createdAt > list[1].createdAt && list[1].createdAt > list[2].createdAt);
  let big = cookie;
  for (let i = 0; i < 6; i++) big = addToTrackCookie(parseTrackCookie(big), tokens[i % 3]);
  assert.ok(parseTrackCookie(big).length <= 5);
  assert.deepEqual(parseTrackCookie("junk~also-junk"), []);
});

test("at 22:30 tracking ends with the order: the token, the list and the link all stop", async () => {
  const o = await newOrder();
  const token = trackingTokenFor(o.id)!;
  assert.ok(await findTrackedOrder(token, null));
  setRetentionClockForTests(sofia(2030, 2, 2, 22, 30));
  assert.equal(await findTrackedOrder(token, null), null);
  assert.deepEqual(await listTrackedOrders([token], null), []);
  await purgeExpiredOrders();
  setRetentionClockForTests(sofia(2030, 2, 3, 12, 0));
  assert.equal(await findTrackedOrder(token, null), null, "and stays gone the next day");
});

test("without AUTH_SECRET no token is issued and none verifies", () => {
  const saved = process.env.AUTH_SECRET;
  try {
    delete process.env.AUTH_SECRET;
    assert.equal(trackingTokenFor("c0000000000000000000000"), null);
    assert.equal(verifyTrackingToken(`c0000000000000000000000.${"A".repeat(43)}`), null);
  } finally {
    process.env.AUTH_SECRET = saved;
  }
});
