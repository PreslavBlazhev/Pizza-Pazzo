/**
 * A (backups). The backup copies on the disk are cleaned by CONTENT — never
 * by the file's date — keeping current orders and unrelated tables, on the
 * current and on older schemas; failures are reported, not swallowed, and an
 * interrupted clean-up is completed by the next run.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { db, dbUnscoped } from "@/lib/db";
import { setRetentionClockForTests } from "@/lib/order-retention";
import { sofiaWallClockToUtc } from "@/lib/report-period";
import { backupsDir, getPurgeState, purgeExpiredOrders } from "@/lib/order-purge";
import { placeOrder } from "@/lib/checkout/place-order";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, deps, key } from "./helpers";

const sofia = (y: number, m: number, d: number, h: number, min: number) => sofiaWallClockToUtc(y, m, d, h, min);
const DIR = backupsDir()!;

after(async () => {
  setRetentionClockForTests(null);
  rmSync(DIR, { recursive: true, force: true });
  await db.$disconnect();
});

beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  setRetentionClockForTests(sofia(2030, 1, 1, 12, 0));
  await purgeExpiredOrders(sofia(2031, 1, 1, 12, 0), { trigger: "test" });
  await dbUnscoped.maintenanceState.deleteMany();
});

async function orderAt(when: Date): Promise<string> {
  setRetentionClockForTests(when);
  const r = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "cash_on_delivery", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.orderId;
}

/** A backup copy written NOW (its file date is always after any cutoff in 2030). */
async function backup(name: string): Promise<string> {
  const file = path.join(DIR, name).replace(/\\/g, "/");
  await dbUnscoped.$executeRawUnsafe(`VACUUM INTO '${file}'`);
  return file;
}

async function inBackup<T>(file: string, read: (c: PrismaClient) => Promise<T>): Promise<T> {
  const c = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    return await read(c);
  } finally {
    await c.$disconnect();
  }
}

test("a NEW backup file holding yesterday's orders is cleaned (the file date is not what decides)", async () => {
  const old = await orderAt(sofia(2030, 3, 1, 12, 0));
  setRetentionClockForTests(sofia(2030, 3, 2, 9, 0)); // after 1 March 22:30, before the purge ran
  const file = await backup("pre-migrate-new.db");
  const r = await purgeExpiredOrders(undefined, { trigger: "test" });
  assert.equal(r.ok, true, JSON.stringify(r.backupFailures));
  assert.equal(r.scrubbedBackups, 1);
  await inBackup(file, async (c) => {
    assert.equal(await c.order.count({ where: { id: old } }), 0);
    assert.equal(await c.orderItem.count({ where: { orderId: old } }), 0);
    assert.equal(await c.restaurantSettings.count(), 1, "unrelated tables stay");
  });
});

test("a backup with old AND current orders keeps the current ones and their lines", async () => {
  const old = await orderAt(sofia(2030, 4, 1, 12, 0));
  const current = await orderAt(sofia(2030, 4, 2, 10, 0));
  const file = await backup("mixed.db");
  setRetentionClockForTests(sofia(2030, 4, 2, 10, 5));
  const r = await purgeExpiredOrders(undefined, { trigger: "test" });
  assert.ok(r.ok);
  await inBackup(file, async (c) => {
    assert.equal(await c.order.count({ where: { id: old } }), 0, "yesterday's order is gone");
    assert.equal(await c.order.count({ where: { id: current } }), 1, "today's order is kept");
    assert.ok((await c.orderItem.count({ where: { orderId: current } })) > 0, "with its lines");
    assert.equal(await c.orderItem.count({ where: { orderId: old } }), 0);
  });
  // The live database follows the same rule.
  assert.equal(await dbUnscoped.order.count({ where: { id: current } }), 1);
  assert.equal(await dbUnscoped.order.count({ where: { id: old } }), 0);
});

test("an OLD-schema backup (first migration only, text dates, missing tables) is cleaned too", async () => {
  const file = path.join(DIR, "2026-07-17-old-schema.db").replace(/\\/g, "/");
  writeFileSync(file, "");
  const sql = readFileSync("prisma/migrations/20260717193053_init_sqlite_pizza_pazzo/migration.sql", "utf8");
  await inBackup(file, async (c) => {
    const statements = sql
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await c.$executeRawUnsafe(stmt);
    }
    await c.$executeRawUnsafe(
      `INSERT INTO "Order" ("id","orderNumber","customerName","customerEmail","customerPhone","deliveryAddress","subtotalBgn","subtotalEur","totalBgn","totalEur","createdAt","updatedAt")
       VALUES ('old1',1,'X','x@example.test','1','A',1,1,1,1,'2026-07-18 10:00:00','2026-07-18 10:00:00'),
              ('old2',2,'Y','y@example.test','2','B',1,1,1,1,1784368800000,1784368800000)`
    );
    await c.$executeRawUnsafe(
      `INSERT INTO "User" ("id","email","passwordHash","fullName","updatedAt") VALUES ('u1','keep@example.test','x','Keep','2026-07-18 10:00:00')`
    );
  });
  setRetentionClockForTests(sofia(2030, 5, 5, 12, 0));
  const r = await purgeExpiredOrders(undefined, { trigger: "test" });
  assert.equal(r.ok, true, JSON.stringify(r.backupFailures));
  await inBackup(file, async (c) => {
    const left = await c.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "Order"`);
    assert.equal(Number(left[0].n), 0, "text and integer dates both recognised");
    const users = await c.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "User"`);
    assert.equal(Number(users[0].n), 1);
  });
});

test("a backup that cannot be cleaned is a FAILURE: not counted, reported, recorded, HTTP-worthy", async () => {
  await orderAt(sofia(2030, 6, 1, 12, 0));
  writeFileSync(path.join(DIR, "corrupt.db"), "this is not an SQLite database at all ".repeat(200));
  setRetentionClockForTests(sofia(2030, 6, 2, 9, 0));
  const r = await purgeExpiredOrders(undefined, { trigger: "test" });
  assert.equal(r.ok, false);
  assert.equal(r.scrubbedBackups, 0);
  assert.equal(r.backupFailures.length, 1);
  assert.equal(r.backupFailures[0].file, "corrupt.db");
  assert.ok(r.deletedOrders >= 1, "the live database is still purged");
  const s = await getPurgeState();
  assert.ok(s?.lastError?.includes("backups"), "the failure is in the maintenance state");
  assert.ok(s?.lastBackupErrors?.includes("corrupt.db"));
  rmSync(path.join(DIR, "corrupt.db"));
  const again = await purgeExpiredOrders(undefined, { trigger: "test" });
  assert.equal(again.ok, true);
  assert.equal((await getPurgeState())?.lastError, null, "a later success clears the error");
});

test("an interrupted clean-up changes nothing; the next run completes it; a third run finds it clean", async () => {
  const old = await orderAt(sofia(2030, 7, 1, 12, 0));
  const current = await orderAt(sofia(2030, 7, 2, 10, 0));
  const file = await backup("interrupted.db");
  setRetentionClockForTests(sofia(2030, 7, 2, 10, 5));

  const crashed = await purgeExpiredOrders(undefined, {
    trigger: "test",
    beforeBackupCommit: () => {
      throw new Error("simulated crash before commit");
    },
  });
  assert.equal(crashed.ok, false);
  assert.equal(crashed.scrubbedBackups, 0);
  assert.match(crashed.backupFailures[0].error, /simulated crash/);
  await inBackup(file, async (c) => {
    assert.equal(await c.order.count({ where: { id: old } }), 1, "rolled back: the file is as it was");
    assert.ok((await c.orderItem.count({ where: { orderId: old } })) > 0, "no half-cleaned file");
  });

  const second = await purgeExpiredOrders(undefined, { trigger: "test" });
  assert.equal(second.ok, true);
  assert.equal(second.scrubbedBackups, 1);
  await inBackup(file, async (c) => {
    assert.equal(await c.order.count({ where: { id: old } }), 0);
    assert.equal(await c.order.count({ where: { id: current } }), 1);
  });

  const third = await purgeExpiredOrders(undefined, { trigger: "test" });
  assert.equal(third.scrubbedBackups, 0);
  assert.equal(third.cleanBackups, 1);
  assert.deepEqual(readdirSync(DIR), ["interrupted.db"], "nothing else written next to it");
});

test("the run records its trigger, the cutoff it covered and how late it was", async () => {
  await orderAt(sofia(2030, 8, 1, 12, 0));
  const at = sofia(2030, 8, 1, 22, 37);
  setRetentionClockForTests(at);
  const r = await purgeExpiredOrders(undefined, { trigger: "cutoff" });
  assert.equal(r.lagSeconds, 7 * 60);
  const s = await getPurgeState();
  assert.equal(s?.lastCutoffAt?.toISOString(), sofia(2030, 8, 1, 22, 30).toISOString());
  assert.equal(s?.lastCutoffLagSeconds, 420);
  assert.equal(s?.lastCutoffTrigger, "cutoff");
  // A later fallback run for the SAME cutoff does not overwrite when it was first done.
  setRetentionClockForTests(sofia(2030, 8, 1, 22, 45));
  await purgeExpiredOrders(undefined, { trigger: "fallback" });
  const s2 = await getPurgeState();
  assert.equal(s2?.lastCutoffLagSeconds, 420);
  assert.equal(s2?.lastTrigger, "fallback");
});
