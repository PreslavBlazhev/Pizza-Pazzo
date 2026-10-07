/**
 * Proves migration 20261007120000_payment_readiness on a COPY of a database
 * that already holds old orders and payment attempts — nothing is lost, no
 * old status or method changes, and no acknowledgement, refund or audit
 * event is invented for the past.
 *
 *   1. build a fresh SQLite from every migration BEFORE it;
 *   2. insert legacy orders (cash, card paid, card failed, card paid +
 *      cancelled with an alert) and their payment attempts, as the old code
 *      wrote them;
 *   3. apply the new migration with `prisma migrate deploy`;
 *   4. compare every old row and value, and check the new columns are NULL
 *      and the new tables empty.
 *
 * Works in a temp folder; prisma/dev.db and production are never touched.
 * Usage: node scripts/verify-payment-readiness-migration.mjs
 */
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const NEW_MIGRATION = "20261007120000_payment_readiness";
const NEW_ORDER_COLUMNS = ["paymentAlertAckAt", "paymentAlertAckBy"];
const NEW_ATTEMPT_COLUMNS = ["redirectFormJson"];
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "pp-migration-check-"));
const schemaDir = join(dir, "prisma");
const url = `file:${join(dir, "prisma", "copy.db").replace(/\\/g, "/")}`;
let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
};
const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
const without = (row, keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

function deploy() {
  execSync(`npx prisma migrate deploy --schema "${join(schemaDir, "schema.prisma")}"`, {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: url },
  });
}

try {
  // ── 1. The database as it was before this change ──
  cpSync(join(root, "prisma", "schema.prisma"), join(schemaDir, "schema.prisma"));
  const all = readdirSync(join(root, "prisma", "migrations"));
  for (const name of all) {
    if (name >= NEW_MIGRATION) continue;
    cpSync(join(root, "prisma", "migrations", name), join(schemaDir, "migrations", name), { recursive: true });
  }
  deploy();

  // ── 2. Legacy orders + attempts, with raw SQL (only the old columns) ──
  const db = new PrismaClient({ datasources: { db: { url } } });
  const legacy = [
    // n, method, paymentStatus, status, total, alert, attempt status
    [2001, "CASH_ON_DELIVERY", "CASH_DUE", "DELIVERED", 21.4, null, null],
    [2002, "CARD_ONLINE", "PAID", "DELIVERED", 13.45, null, "PAID"],
    [2003, "CARD_ONLINE", "FAILED", "CANCELLED", 9.9, null, "FAILED"],
    [2004, "CARD_ONLINE", "PAID", "CANCELLED", 18.0, "PAID_AFTER_CANCEL", "PAID"],
    [2005, "CARD_ONLINE", "AWAITING_PAYMENT", "PENDING", 7.5, null, "REDIRECTED"],
  ];
  for (const [n, method, pay, status, total, alert, attempt] of legacy) {
    await db.$executeRawUnsafe(
      `INSERT INTO "Order" ("id","orderNumber","customerName","customerEmail","customerPhone","deliveryAddress","deliveryCity","paymentMethod","paymentStatus","deliveryMethod","status","subtotalEur","totalEur","paymentAlert","releasedToKitchenAt","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,'DELIVERY',?,?,?,?,?,?,?)`,
      `legacy_${n}`, n, `Клиент ${n}`, `c${n}@example.test`, "0888000000", "ул. Тестова 1", "Плевен",
      method, pay, status, total, total, alert,
      pay === "PAID" || method === "CASH_ON_DELIVERY" ? "2026-09-01T12:01:00.000Z" : null,
      "2026-09-01T12:00:00.000Z", "2026-09-01T12:00:00.000Z"
    );
    if (attempt) {
      await db.$executeRawUnsafe(
        `INSERT INTO "PaymentAttempt" ("id","orderId","reference","provider","environment","providerPaymentId","redirectUrl","amountMinor","currency","status","locale","createdAt","updatedAt")
         VALUES (?,?,?,'SIMULATOR','sandbox',?,?,?,'EUR',?,'bg',?,?)`,
        `att_${n}`, `legacy_${n}`, `PP${n}A1`, `sim_${n}`, `https://pay.example.test/${n}`,
        Math.round(total * 100), attempt, "2026-09-01T12:00:30.000Z", "2026-09-01T12:00:30.000Z"
      );
    }
  }
  const before = await db.$queryRawUnsafe(`SELECT * FROM "Order" ORDER BY "orderNumber"`);
  const attemptsBefore = await db.$queryRawUnsafe(`SELECT * FROM "PaymentAttempt" ORDER BY "id"`);
  await db.$disconnect();

  // ── 3. The new migration (and anything after it) ──
  for (const name of all.filter((n) => n >= NEW_MIGRATION && n !== "migration_lock.toml")) {
    cpSync(join(root, "prisma", "migrations", name), join(schemaDir, "migrations", name), { recursive: true });
  }
  deploy();

  // ── 4. Checks ──
  const db2 = new PrismaClient({ datasources: { db: { url } } });
  const after = await db2.$queryRawUnsafe(`SELECT * FROM "Order" ORDER BY "orderNumber"`);
  const attemptsAfter = await db2.$queryRawUnsafe(`SELECT * FROM "PaymentAttempt" ORDER BY "id"`);
  console.log(`Migration ${NEW_MIGRATION} on a copy with ${before.length} legacy orders, ${attemptsBefore.length} attempts:`);
  check("same number of orders and attempts", after.length === before.length && attemptsAfter.length === attemptsBefore.length);
  check(
    "every old order value unchanged (method, status, payment status, alert, kitchen release)",
    before.every((row, i) => json(row) === json(without(after[i], NEW_ORDER_COLUMNS)))
  );
  check(
    "every old payment attempt unchanged",
    attemptsBefore.every((row, i) => json(row) === json(without(attemptsAfter[i], NEW_ATTEMPT_COLUMNS)))
  );
  check("no alert acknowledgement invented", after.every((r) => r.paymentAlertAckAt === null && r.paymentAlertAckBy === null));
  check("no POST form invented for old attempts", attemptsAfter.every((r) => r.redirectFormJson === null));
  check("no refund recorded for the past", (await db2.paymentRefundRecord.count()) === 0);
  check("no audit event invented for the past", (await db2.paymentAuditEvent.count()) === 0);
  const orders = await db2.order.findMany({ include: { paymentAttempts: true } });
  check("old orders still read through Prisma (with attempts)", orders.length === before.length);
  const stillAlert = orders.find((o) => o.orderNumber === 2004);
  check("the old unacknowledged alert stays visible to staff", stillAlert?.paymentAlert === "PAID_AFTER_CANCEL" && stillAlert.paymentAlertAckAt === null);
  await db2.$disconnect();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nMIGRATION CHECK FAILED (${failures})`);
  process.exit(1);
}
console.log("\nMIGRATION CHECK OK");
