/**
 * The 22:30 purge — SERVER ONLY. Physically deletes every expired order and
 * everything that belongs to it from the live database.
 *
 * What goes (rows created at or before the last 22:30 Europe/Sofia):
 *   Order                   — every status: new, accepted, cancelled,
 *                             delivered, unfinished, unpaid, test orders
 *   OrderItem               — the lines, extras snapshots, combo shares
 *   EmailOutbox             — queued / retried / sent e-mail jobs (they hold
 *                             no message body; it is rendered at send time)
 *   PaymentAttempt          — card attempts, incl. the provider snapshot
 *   PaymentAuditEvent       — staff actions on the money side
 *   PaymentRefundRecord     — recorded refunds
 *   PaymentSimulatorSession — the simulator's ledger (amounts, references)
 * The tracking "token" is not stored anywhere (lib/order-tracking.ts), so it
 * dies with the order row it is derived from.
 *
 * What stays: the menu, settings, print layouts, users and addresses, the
 * order-number counter and this job's own bookkeeping (counts only).
 *
 * Safe to run any number of times, from any number of processes, at any time:
 * it only ever deletes rows that are ALREADY invisible (lib/db.ts hides them
 * from 22:30:00), and a DELETE of nothing is a no-op. A missed evening (the
 * service was down, the cron job did not fire) is caught up by the next run,
 * because "expired" is "created at or before the LAST cutoff", not "created
 * yesterday".
 *
 * `secure_delete` makes SQLite overwrite the freed pages with zeros, and the
 * WAL is checkpointed and truncated afterwards, so the deleted rows do not
 * linger in the database file's free pages or in the -wal file. That is about
 * THIS file only — see IMPLEMENTATION_REPORT.md for what lives outside it
 * (Render disk snapshots, e-mails already delivered, provider logs).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { dbUnscoped } from "@/lib/db";
import { lastCutoffAtOrBefore, retentionNow } from "@/lib/order-retention";

export const MAINTENANCE_ROW_ID = "orders";

export interface PurgeSummary {
  cutoffAt: string;
  deletedOrders: number;
  deletedSimulatorSessions: number;
  scrubbedBackups: number;
}

/** The tables that hang off Order, deleted child-first (also cascaded by FK). */
const CHILD_DELETES = [
  "emailOutbox",
  "orderItem",
  "paymentAttempt",
  "paymentAuditEvent",
  "paymentRefundRecord",
] as const;

export async function purgeExpiredOrders(now: Date = retentionNow()): Promise<PurgeSummary> {
  const cutoff = lastCutoffAtOrBefore(now);
  const expired = { createdAt: { lte: cutoff } };

  try {
    // Zero the freed pages. connection_limit=1 (lib/db.ts) means this is the
    // connection the DELETEs below run on.
    await dbUnscoped.$queryRawUnsafe("PRAGMA secure_delete = ON");
  } catch {
    /* an SQLite without the pragma still deletes the rows */
  }

  const { deletedOrders, deletedSimulatorSessions } = await dbUnscoped.$transaction(async (tx) => {
    const ids = (await tx.order.findMany({ where: expired, select: { id: true } })).map((o) => o.id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      for (const table of CHILD_DELETES) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx[table] as any).deleteMany({ where: { orderId: { in: chunk } } });
      }
    }
    const orders = await tx.order.deleteMany({ where: expired });
    const sessions = await tx.paymentSimulatorSession.deleteMany({ where: expired });
    return { deletedOrders: orders.count, deletedSimulatorSessions: sessions.count };
  });

  try {
    await dbUnscoped.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* not in WAL mode — nothing to checkpoint */
  }

  const scrubbedBackups = await scrubBackups(cutoff);

  await recordRun({ at: now, cutoff, deleted: deletedOrders, error: null });
  if (deletedOrders > 0 || scrubbedBackups > 0) {
    // Counts only — never an order number, a name or an address.
    console.info(
      `[retention] purge: ${deletedOrders} expired order(s) deleted, ${scrubbedBackups} backup file(s) scrubbed`
    );
  }
  return {
    cutoffAt: cutoff.toISOString(),
    deletedOrders,
    deletedSimulatorSessions,
    scrubbedBackups,
  };
}

async function recordRun(run: { at: Date; cutoff: Date; deleted: number; error: string | null }) {
  try {
    await dbUnscoped.maintenanceState.upsert({
      where: { id: MAINTENANCE_ROW_ID },
      create: {
        id: MAINTENANCE_ROW_ID,
        lastRunAt: run.at,
        lastCutoffAt: run.cutoff,
        lastDeleted: run.deleted,
        lastError: run.error,
      },
      update: { lastRunAt: run.at, lastCutoffAt: run.cutoff, lastDeleted: run.deleted, lastError: run.error },
    });
  } catch {
    /* bookkeeping only */
  }
}

/** The live database file, or null when DATABASE_URL is not a SQLite file. */
function databaseFile(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const raw = url.slice("file:".length).split("?")[0];
  return path.isAbsolute(raw) ? raw : path.resolve("prisma", raw);
}

/**
 * The pre-migration backups (scripts/backup-before-migrate.mjs, `npm run
 * db:backup`) are full copies of the database — orders included. A copy
 * written before the last cutoff can only hold expired orders, so every order
 * table in it is emptied and the file is vacuumed; menu, settings and users
 * stay restorable. A copy written after the cutoff holds today's orders and is
 * scrubbed by the first run after tonight's cutoff.
 */
async function scrubBackups(cutoff: Date): Promise<number> {
  const dbFile = databaseFile();
  if (!dbFile) return 0;
  const dir = path.join(path.dirname(dbFile), "backups");
  if (!existsSync(dir)) return 0;

  let scrubbed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".db")) continue;
    const file = path.join(dir, name);
    try {
      if (statSync(file).mtime.getTime() > cutoff.getTime()) continue;
    } catch {
      continue;
    }
    const client = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
    try {
      await client.$queryRawUnsafe("PRAGMA secure_delete = ON").catch(() => undefined);
      for (const table of [
        "EmailOutbox",
        "OrderItem",
        "PaymentAttempt",
        "PaymentAuditEvent",
        "PaymentRefundRecord",
        "PaymentSimulatorSession",
        "Order",
      ]) {
        // A backup from an older schema may lack a table — that is fine.
        await client.$executeRawUnsafe(`DELETE FROM "${table}"`).catch(() => undefined);
      }
      await client.$executeRawUnsafe("VACUUM");
      scrubbed++;
    } catch (err) {
      console.error(`[retention] could not scrub backup ${name}:`, (err as Error).message);
    } finally {
      await client.$disconnect().catch(() => undefined);
    }
  }
  return scrubbed;
}

// ── Opportunistic runs ──────────────────────────────────────────────────────

const SWEEP_EVERY_MS = 10 * 60 * 1000;
const state = globalThis as unknown as { __ppPurge?: { cutoff: number; at: number; running: boolean } };

/**
 * Runs the purge if this process has not purged since the last cutoff (or not
 * for ten minutes). Cheap enough to call from busy paths — the kitchen poll,
 * the tracking API, server start — and never throws: the scheduled job is
 * the primary trigger, this is the safety net when it is late or missing.
 */
export async function maybePurgeExpiredOrders(now: Date = retentionNow()): Promise<void> {
  const cutoff = lastCutoffAtOrBefore(now).getTime();
  const s = (state.__ppPurge ??= { cutoff: 0, at: 0, running: false });
  if (s.running) return;
  if (s.cutoff === cutoff && now.getTime() - s.at < SWEEP_EVERY_MS) return;
  s.running = true;
  try {
    await purgeExpiredOrders(now);
    s.cutoff = cutoff;
    s.at = now.getTime();
  } catch (err) {
    console.error("[retention] purge failed:", (err as Error).message);
    await recordRun({
      at: now,
      cutoff: new Date(cutoff),
      deleted: 0,
      error: String((err as Error).message).slice(0, 200),
    });
  } finally {
    s.running = false;
  }
}

/** For the admin and the post-deploy check: when the purge last ran. */
export async function getPurgeState() {
  return dbUnscoped.maintenanceState.findUnique({ where: { id: MAINTENANCE_ROW_ID } });
}
