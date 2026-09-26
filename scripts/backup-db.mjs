// Consistent ONLINE backup of the SQLite database, plus a check of the copy.
//
//   npm run db:backup                         → <db dir>/backups/pizza-pazzo-<timestamp>.db
//   npm run db:backup -- /var/data/backups/before-payments.db
//
// Why not `cp`: while the site runs, SQLite may be halfway through writing a
// page (and, in WAL mode, recent commits live in a separate -wal file). A
// plain file copy can capture a torn, inconsistent database that only fails
// when you need it. `VACUUM INTO` asks SQLite itself to write a complete,
// transactionally consistent copy while the site keeps serving.
//
// The copy is then opened on its own and checked:
//   - PRAGMA integrity_check must answer "ok";
//   - the row counts of the important tables must match the live database
//     read in the same moment (a difference means orders arrived during the
//     backup — the script says so; re-run it in a quiet minute if it matters).
//
// Uses DATABASE_URL (Render: file:/var/data/pizza-pazzo.db). Never overwrites
// an existing file. Exits non-zero if the copy fails its check.
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) {
  console.error("db:backup: DATABASE_URL must be a SQLite file: URL.");
  process.exit(1);
}

// Prisma resolves a relative file: URL against prisma/schema.prisma's folder.
const rawPath = url.slice("file:".length);
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve("prisma", rawPath);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.resolve(
  process.argv[2] ?? path.join(path.dirname(dbPath), "backups", `pizza-pazzo-${stamp}.db`)
);
if (existsSync(target)) {
  console.error(`db:backup: ${target} already exists — refusing to overwrite.`);
  process.exit(1);
}
mkdirSync(path.dirname(target), { recursive: true });

const TABLES = ["Order", "OrderItem", "PaymentAttempt", "User", "MenuProduct", "MenuVariant", "MenuCategory"];

async function counts(client) {
  const out = {};
  for (const t of TABLES) {
    const rows = await client.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${t}"`);
    out[t] = Number(rows[0].n);
  }
  return out;
}

const live = new PrismaClient();
try {
  // SQL string literal: single quotes doubled. The path is ours, not user input.
  await live.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const liveCounts = await counts(live);

  const copy = new PrismaClient({ datasources: { db: { url: `file:${target}` } } });
  try {
    const check = await copy.$queryRawUnsafe("PRAGMA integrity_check");
    const verdict = String(Object.values(check[0])[0]);
    const copyCounts = await counts(copy);
    const size = statSync(target).size;

    console.log(`db:backup: ${dbPath} → ${target} (${(size / 1024).toFixed(0)} KB)`);
    console.log(`db:backup: integrity_check = ${verdict}`);
    for (const t of TABLES) {
      const same = liveCounts[t] === copyCounts[t];
      console.log(`  ${same ? "✓" : "≠"} ${t}: copy ${copyCounts[t]} / live ${liveCounts[t]}`);
    }
    if (verdict !== "ok") {
      console.error("db:backup: the copy FAILED its integrity check — do not rely on it.");
      process.exitCode = 1;
    } else if (TABLES.some((t) => liveCounts[t] !== copyCounts[t])) {
      console.warn("db:backup: rows changed during the backup (new orders?). The copy is consistent as of its start; re-run for a newer one.");
    } else {
      console.log("db:backup: OK");
    }
  } finally {
    await copy.$disconnect();
  }
} finally {
  await live.$disconnect();
}
