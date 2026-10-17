/**
 * The order HISTORY IS KEPT (owner, 2026-10-17): the daily 22:30 deletion is
 * switched off. Proven on what the site really runs — the retention is NOT
 * switched on in this file:
 *
 *   - the switch is off and nothing but a code change turns it on (no
 *     environment variable, not even the test hook in production);
 *   - old orders, their lines, payment records and e-mail jobs, and a backup
 *     file holding old orders, stay untouched after a restart (the start
 *     hook), passing 22:30 (and midnight, and days), the traffic sweep, the
 *     22:30 timer, the purge itself and the maintenance request;
 *   - they stay VISIBLE: order lookup, the admin list, the customer's
 *     history, the report;
 *   - no separate 22:30 ordering ban: the opening hours decide;
 *   - tracking access still ends at 22:30 of the order's day, and that ends
 *     ACCESS only — the order stays.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { db, dbUnscoped } from "@/lib/db";
import {
  ORDER_RETENTION_ENABLED,
  orderRetentionEnabled,
  setRetentionClockForTests,
  setRetentionEnabledForTests,
} from "@/lib/order-retention";
import { sofiaWallClockToUtc } from "@/lib/report-period";
import { backupsDir, maybePurgeExpiredOrders, purgeExpiredOrders, scheduleCutoffPurge, scrubBackups } from "@/lib/order-purge";
import { placeOrder } from "@/lib/checkout/place-order";
import { getOrderById, getOrders, getOrdersForUser } from "@/lib/orders";
import { getAdminReport } from "@/lib/reports";
import { resolveStoreStatus } from "@/lib/store-hours";
import { findTrackedOrder, listTrackedOrders, trackingTokenFor } from "@/lib/order-tracking";
import { changeOrderStatus } from "@/lib/order-workflow";
import { register } from "@/instrumentation";
import { POST as maintenanceRun } from "@/app/api/maintenance/run/route";
import type { RestaurantHours } from "@/types/settings";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, deps, key } from "./helpers";

const sofia = (y: number, m: number, d: number, h: number, min: number) => sofiaWallClockToUtc(y, m, d, h, min);
const DIR = backupsDir()!;
const SECRET = "history-kept-maintenance-secret-0123456789";

let userId = "";
const ids: string[] = [];

after(async () => {
  setRetentionClockForTests(null);
  rmSync(DIR, { recursive: true, force: true });
  await db.$disconnect();
});

async function orderAt(when: Date, withUser = false): Promise<string> {
  setRetentionClockForTests(when);
  const r = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: STANDARD_ITEMS,
      paymentMethod: "cash_on_delivery",
      checkoutKey: key(),
      userId: withUser ? userId : null,
      consents: ALL_CONSENTS,
    },
    deps
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.orderId;
}

/** Everything of the old orders, row by row, plus the backup file's bytes and date. */
async function snapshot() {
  const where = { id: { in: ids } };
  const orders = await dbUnscoped.order.findMany({ where, orderBy: { id: "asc" } });
  const items = await dbUnscoped.orderItem.findMany({ where: { orderId: { in: ids } }, orderBy: { id: "asc" } });
  // E-mail jobs: their send STATUS may move on (the maintenance request runs
  // the e-mail retries — wanted); what must not happen is a job disappearing.
  const jobs = (
    await dbUnscoped.emailOutbox.findMany({ where: { orderId: { in: ids } }, orderBy: { id: "asc" } })
  ).map((j) => ({ id: j.id, orderId: j.orderId, kind: j.kind, dedupeKey: j.dedupeKey }));
  const files = readdirSync(DIR)
    .sort()
    .map((name) => {
      const file = path.join(DIR, name);
      return `${name}:${createHash("sha256").update(readFileSync(file)).digest("hex")}:${statSync(file).mtimeMs}`;
    });
  return JSON.stringify({ orders, items, jobs, files });
}

before(async () => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const u = await dbUnscoped.user.create({
    data: { email: `history-${Date.now()}@example.test`, passwordHash: "x", fullName: "History Kept" },
  });
  userId = u.id;
  // Orders of three past days, one of them accepted (an e-mail job exists).
  ids.push(await orderAt(sofia(2030, 1, 10, 12, 0), true));
  ids.push(await orderAt(sofia(2030, 1, 11, 21, 0), true));
  ids.push(await orderAt(sofia(2030, 1, 12, 22, 29)));
  setRetentionClockForTests(sofia(2030, 1, 12, 22, 29));
  const accepted = await changeOrderStatus({ orderId: ids[2], next: "ACCEPTED", expectedStatus: "PENDING", estimatedTimeMinutes: 30 });
  assert.ok(accepted.ok, JSON.stringify(accepted));
  // A backup copy holding them (as the pre-migration backup would).
  const file = path.join(DIR, "pre-migrate-history.db").replace(/\\/g, "/");
  await dbUnscoped.$executeRawUnsafe(`VACUUM INTO '${file}'`);
});

test("the switch is OFF, and neither an environment variable nor the test hook in production turns it on", () => {
  assert.equal(ORDER_RETENTION_ENABLED, false);
  assert.equal(orderRetentionEnabled(), false);
  const saved = { ...process.env };
  try {
    Object.assign(process.env, {
      ORDER_RETENTION_ENABLED: "true",
      RETENTION_ENABLED: "1",
      ORDER_RETENTION: "on",
    });
    assert.equal(orderRetentionEnabled(), false, "no environment variable enables it");
    setRetentionEnabledForTests(true);
    (process.env as Record<string, string>).NODE_ENV = "production";
    assert.equal(orderRetentionEnabled(), false, "the test hook is ignored outside NODE_ENV=test");
  } finally {
    setRetentionEnabledForTests(false);
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  assert.equal(orderRetentionEnabled(), false);
});

test("restart, 22:30, midnight, days later, traffic, the timer, the purge and the maintenance request change NOTHING", async () => {
  const before = await snapshot();
  assert.equal(JSON.parse(before).orders.length, 3);
  assert.equal(JSON.parse(before).files.length, 1);

  // A restart: the start hook.
  (process.env as Record<string, string>).NEXT_RUNTIME = "nodejs";
  await register();
  // The 22:30 timer is not armed.
  scheduleCutoffPurge();
  assert.equal((globalThis as Record<string, unknown>).__ppPurgeTimer, undefined, "no 22:30 timer");

  for (const when of [
    sofia(2030, 1, 12, 22, 30), // the cutoff of the last order's day
    sofia(2030, 1, 12, 23, 59),
    sofia(2030, 1, 13, 0, 1), // midnight passed
    sofia(2030, 2, 20, 12, 0), // weeks later
  ]) {
    setRetentionClockForTests(when);
    await maybePurgeExpiredOrders(undefined, "start");
    await maybePurgeExpiredOrders(undefined, "traffic");
    const p = await purgeExpiredOrders(undefined, { trigger: "timer" });
    assert.equal(p.disabled, true);
    assert.equal(p.deletedOrders, 0);
    const scrub = await scrubBackups(when);
    assert.deepEqual(scrub, { scrubbed: 0, clean: 0, failed: [] }, "no backup file is even opened");
  }

  // The maintenance request (what the prepared Render Cron Jobs would call).
  process.env.MAINTENANCE_SECRET = SECRET;
  for (const trigger of ["cutoff", "fallback", ""]) {
    const res = await maintenanceRun(
      new NextRequest(`http://localhost/api/maintenance/run${trigger ? `?trigger=${trigger}` : ""}`, {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}`, "x-forwarded-for": `10.0.0.${trigger.length}` },
      })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.retention, "disabled");
    assert.equal(body.purge, undefined, "the endpoint does not run the purge at all");
  }

  // Nothing written about a purge either.
  assert.equal(await dbUnscoped.maintenanceState.count({ where: { lastRunAt: { not: null } } }), 0);
  assert.equal(await snapshot(), before, "orders, lines, e-mail jobs and the backup file are byte-identical");
});

test("old orders stay VISIBLE: lookup, the admin list, the customer's history and the report", async () => {
  setRetentionClockForTests(sofia(2030, 2, 20, 12, 0));
  for (const id of ids) {
    const o = await getOrderById(id);
    assert.ok(o, `order ${id} readable`);
    assert.ok((o?.items?.length ?? 0) > 0, "with its lines");
  }
  const list = await getOrders(200);
  assert.ok(ids.every((id) => list.some((o) => o.id === id)), "in the admin list");
  const mine = await getOrdersForUser(userId);
  assert.deepEqual(mine.map((o) => o.id).sort(), [ids[0], ids[1]].sort(), "in the customer's history");
  const report = await getAdminReport({
    range: {
      from: sofia(2030, 1, 1, 0, 0),
      toExclusive: sofia(2030, 2, 1, 0, 0),
      fromDate: "2030-01-01",
      toDate: "2030-01-31",
    } as Parameters<typeof getAdminReport>[0]["range"],
    page: 1,
  });
  assert.ok(ids.every((id) => report.orders.some((o) => o.id === id)), "in the report for January 2030");
});

test("no separate 22:30 ban: the opening hours decide, and an order at 22:45 is accepted", async () => {
  const day = { open: true, from: "11:00", to: "23:00" };
  const hours = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, day])
  ) as unknown as RestaurantHours;
  const none = { active: false, until: null };
  const late = resolveStoreStatus(hours, none, sofia(2030, 3, 5, 22, 45));
  assert.equal(late.isOpen, true, "open until 23:00 by the hours");
  assert.notEqual(late.reason, "daily_cutoff");
  const closed = resolveStoreStatus(hours, none, sofia(2030, 3, 5, 23, 15));
  assert.equal(closed.isOpen, false);
  assert.equal(closed.reason, "hours");
  // The real hours end at 22:30: closed then — because of the hours.
  const real = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [
      d,
      { open: true, from: "11:00", to: "22:30" },
    ])
  ) as unknown as RestaurantHours;
  assert.equal(resolveStoreStatus(real, none, sofia(2030, 3, 5, 22, 45)).reason, "hours");
  assert.equal(resolveStoreStatus(real, none, sofia(2030, 3, 5, 22, 45), { active: true, until: null }).isOpen, true, "a forced opening works");
  // placeOrder itself has no 22:30 refusal.
  const id = await orderAt(sofia(2030, 3, 5, 22, 45));
  assert.ok(await getOrderById(id));
});

test("tracking access ends at 22:30 of the order's day — and the order stays", async () => {
  const id = await orderAt(sofia(2030, 4, 2, 12, 0));
  const token = trackingTokenFor(id)!;
  setRetentionClockForTests(sofia(2030, 4, 2, 22, 29));
  assert.ok(await findTrackedOrder(token, null), "trackable during its day");
  assert.equal((await listTrackedOrders([token], null)).length, 1);
  setRetentionClockForTests(sofia(2030, 4, 2, 22, 30));
  assert.equal(await findTrackedOrder(token, null), null, "access closed at 22:30");
  assert.equal((await listTrackedOrders([token], null)).length, 0);
  setRetentionClockForTests(sofia(2030, 4, 3, 10, 0));
  assert.equal(await findTrackedOrder(token, null), null, "still closed the next day");
  assert.ok(await getOrderById(id), "the order itself is kept");
  assert.equal(await dbUnscoped.order.count({ where: { id } }), 1);
});

test("in the source, every order deletion sits behind the switch (or is account anonymisation)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs)$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ["app", "lib", "components"]) walk(d);
  files.push("instrumentation.ts");
  const deletes = /\b(order|orderItem|paymentAttempt|paymentAuditEvent|paymentRefundRecord|emailOutbox)\.delete(Many)?\(|DELETE FROM "(Order|OrderItem|PaymentAttempt|PaymentAuditEvent|PaymentRefundRecord|EmailOutbox)"/;
  const offenders = files
    .filter((f) => deletes.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(/\\/g, "/"))
    .sort();
  // lib/order-purge.ts: every entry point returns first while the switch is
  // off (proven above). lib/email/outbox.ts: the delete runs only when
  // orderRetentionEnabled() is true.
  assert.deepEqual(offenders, ["lib/email/outbox.ts", "lib/order-purge.ts"]);
  const outbox = readFileSync("lib/email/outbox.ts", "utf8");
  const guard = outbox.indexOf("if (orderRetentionEnabled() && !isOrderLive(");
  const del = outbox.indexOf("await db.emailOutbox.deleteMany(");
  assert.ok(guard > 0 && del > guard && del - guard < 200, "the only delete in the outbox is inside the retention-ON branch");
  assert.equal(outbox.split("emailOutbox.deleteMany(").length - 1, 1);
});
