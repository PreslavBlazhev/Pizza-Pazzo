/**
 * Proves the 2026-09-29 migration (checkout consents + phone fix) on a COPY
 * of a database that already holds representative old orders — no data is
 * lost and no historical consent is invented.
 *
 *   1. build a fresh SQLite from every migration BEFORE 20260929120000;
 *   2. insert legacy orders (cash/delivered, card/paid, cancelled, anonymised,
 *      with extras) + the broken "+359 801 999" phone, as the old code wrote;
 *   3. apply the new migration with `prisma migrate deploy`;
 *   4. check every old row and value is intact, the consent columns are NULL
 *      on all of them, and only the broken phone value was corrected.
 *
 * Works in a temp folder; prisma/dev.db and production are never touched.
 * Usage: node scripts/verify-consent-migration.mjs
 */
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const NEW_MIGRATION = "20260929120000_checkout_consents";
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "pp-migration-check-"));
const schemaDir = join(dir, "prisma");
const url = `file:${join(dir, "prisma", "copy.db").replace(/\\/g, "/")}`;
let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
};

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
    if (name === NEW_MIGRATION) continue;
    cpSync(join(root, "prisma", "migrations", name), join(schemaDir, "migrations", name), { recursive: true });
  }
  deploy();

  // ── 2. Representative legacy data, written with raw SQL (the old columns) ──
  const db = new PrismaClient({ datasources: { db: { url } } });
  await db.$executeRawUnsafe(`UPDATE "RestaurantSettings" SET "secondaryPhone" = '+359 801 999'`);
  const legacy = [
    [1001, "CASH_ON_DELIVERY", "CASH_DUE", "DELIVERED", 21.4, null],
    [1002, "CARD_ONLINE", "PAID", "DELIVERED", 13.45, null],
    [1003, "CARD_ONLINE", "PAID", "CANCELLED", 9.9, null],
    [1004, "CASH_ON_DELIVERY", "CASH_DUE", "PENDING", 5.5, null],
    [1005, "CASH_ON_DELIVERY", "CASH_DUE", "DELIVERED", 30.2, "2026-09-20T10:00:00.000Z"],
  ];
  for (const [n, method, pay, status, total, anon] of legacy) {
    await db.$executeRawUnsafe(
      `INSERT INTO "Order" ("id","orderNumber","customerName","customerEmail","customerPhone","deliveryAddress","deliveryCity","paymentMethod","paymentStatus","deliveryMethod","status","subtotalEur","totalEur","createdAt","updatedAt","anonymizedAt")
       VALUES (?,?,?,?,?,?,?,?,?,'DELIVERY',?,?,?,?,?,?)`,
      `legacy_${n}`, n, anon ? "" : `Клиент ${n}`, anon ? "" : `c${n}@example.test`, anon ? "" : "0888000000",
      anon ? "" : "ул. Тестова 1", "Плевен", method, pay, status, total, total,
      "2026-09-01T12:00:00.000Z", "2026-09-01T12:00:00.000Z", anon
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "OrderItem" ("id","orderId","productId","productNameBg","quantity","unitPriceEur","totalPriceEur","extrasJson","createdAt")
       VALUES (?,?,?,?,1,?,?,?,?)`,
      `item_${n}`, `legacy_${n}`, "prod_margarita", "Маргарита", total, total,
      n === 1001 ? JSON.stringify([{ key: "sauce:x", quantity: 2, unitPriceEur: 0.5, totalPriceEur: 1 }]) : "[]",
      "2026-09-01T12:00:00.000Z"
    );
  }
  const before = await db.$queryRawUnsafe(`SELECT * FROM "Order" ORDER BY "orderNumber"`);
  const itemsBefore = await db.$queryRawUnsafe(`SELECT * FROM "OrderItem" ORDER BY "id"`);
  await db.$disconnect();

  // ── 3. The new migration ──
  cpSync(join(root, "prisma", "migrations", NEW_MIGRATION), join(schemaDir, "migrations", NEW_MIGRATION), { recursive: true });
  deploy();

  // ── 4. Checks ──
  const db2 = new PrismaClient({ datasources: { db: { url } } });
  const after = await db2.$queryRawUnsafe(`SELECT * FROM "Order" ORDER BY "orderNumber"`);
  const itemsAfter = await db2.$queryRawUnsafe(`SELECT * FROM "OrderItem" ORDER BY "id"`);
  console.log(`Migration ${NEW_MIGRATION} on a copy with ${before.length} legacy orders:`);
  check("same number of orders", after.length === before.length);
  check("same number of order items", itemsAfter.length === itemsBefore.length);
  const strip = (row) => {
    const { consentTermsVersion, consentRefundsVersion, consentPrivacyVersion, consentRecordedAt, ...rest } = row;
    return JSON.stringify(rest, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  };
  check("every old column value unchanged", before.every((row, i) => strip(row) === strip(after[i])));
  check("order items byte-for-byte unchanged", JSON.stringify(itemsBefore, (_k, v) => (typeof v === "bigint" ? Number(v) : v)) === JSON.stringify(itemsAfter, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  check(
    "no consent invented for any old order",
    after.every((r) => r.consentTermsVersion === null && r.consentRefundsVersion === null && r.consentPrivacyVersion === null && r.consentRecordedAt === null)
  );
  const orders = await db2.order.findMany({ include: { items: true } });
  check("old orders still read through Prisma (with items)", orders.length === before.length && orders.every((o) => o.items.length === 1));
  const s = await db2.restaurantSettings.findUniqueOrThrow({ where: { id: "restaurant" } });
  check("broken phone '+359 801 999' corrected to '+359 64 801 999'", s.secondaryPhone === "+359 64 801 999");
  await db2.$executeRawUnsafe(`UPDATE "RestaurantSettings" SET "secondaryPhone" = '+359 88 000 0000'`);
  // Re-run the migration's UPDATE on an owner-edited value: it must not match.
  const sql = readFileSync(join(root, "prisma", "migrations", NEW_MIGRATION, "migration.sql"), "utf8");
  const update = sql.slice(sql.indexOf("UPDATE"));
  await db2.$executeRawUnsafe(update.trim().replace(/;s*$/, ""));
  const s2 = await db2.restaurantSettings.findUniqueOrThrow({ where: { id: "restaurant" } });
  check("a phone the owner edited is never overwritten by the fix", s2.secondaryPhone === "+359 88 000 0000");
  await db2.$disconnect();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nMIGRATION CHECK FAILED (${failures})`);
  process.exit(1);
}
console.log("\nMIGRATION CHECK OK");
