// Backup of the SQLite database BEFORE `prisma migrate deploy`, only when a
// migration is actually pending. Runs at start on Render, ahead of the
// migration (see render.yaml startCommand and package.json "start:render").
//
//   node scripts/backup-before-migrate.mjs
//
// - no pending migration (the usual restart)  → does nothing, exit 0;
// - no database yet (a brand-new disk)        → nothing to protect, exit 0;
// - pending migration(s)                      → scripts/backup-db.mjs writes
//   <db dir>/backups/pre-migrate-<first pending>-<timestamp>.db and checks it.
//   If the backup fails, this exits 1 and the start stops BEFORE the
//   migration: Render keeps serving the previous, healthy deploy.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) {
  console.log("backup-before-migrate: not a SQLite file: URL — skipped.");
  process.exit(0);
}
const rawPath = url.slice("file:".length);
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve("prisma", rawPath);
if (!existsSync(dbPath)) {
  console.log("backup-before-migrate: no database yet — nothing to back up.");
  process.exit(0);
}

const all = readdirSync(path.resolve("prisma", "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const db = new PrismaClient();
let applied = new Set();
try {
  const rows = await db.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  );
  applied = new Set(rows.map((r) => r.migration_name));
} catch {
  // No migrations table: a database Prisma never migrated — back it up anyway.
} finally {
  await db.$disconnect();
}

const pending = all.filter((m) => !applied.has(m));
if (pending.length === 0) {
  console.log("backup-before-migrate: no pending migration — skipped.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(path.dirname(dbPath), "backups", `pre-migrate-${pending[0]}-${stamp}.db`);
console.log(`backup-before-migrate: ${pending.length} pending (${pending.join(", ")}) → backing up first`);
try {
  execFileSync(process.execPath, [path.resolve("scripts", "backup-db.mjs"), target], { stdio: "inherit" });
} catch {
  console.error("backup-before-migrate: BACKUP FAILED — not migrating, not starting.");
  process.exit(1);
}
