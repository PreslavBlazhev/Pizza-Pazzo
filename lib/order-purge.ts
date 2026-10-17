/**
 * The 22:30 purge — SERVER ONLY. SWITCHED OFF: the order history is kept
 * (owner, 2026-10-17; lib/order-retention.ts ORDER_RETENTION_ENABLED = false).
 * While it is off, EVERY entry point below — purgeExpiredOrders,
 * scrubBackups, maybePurgeExpiredOrders (start, traffic), scheduleCutoffPurge
 * (the 22:30 timer) and so the maintenance endpoint — returns before touching
 * any row or file: no order, line, payment record, e-mail job or backup is
 * deleted or changed. The code is kept for a possible later decision.
 *
 * When ON, it physically deletes every expired order and everything that
 * belongs to it, from the live database and from the backup copies on the
 * same disk.
 *
 * TWO DIFFERENT GUARANTEES — kept apart on purpose:
 *   1. UNAVAILABILITY is exact: from 22:30:00 Europe/Sofia no expired order
 *      can be read, changed, printed, tracked or e-mailed. That is the
 *      retention filter in lib/db.ts and does not depend on this module.
 *   2. PHYSICAL DELETION (this module) happens when a run happens:
 *        - the in-process timer at 22:30:00 while the web process is up
 *          (scheduleCutoffPurge, started by instrumentation.ts);
 *        - the scheduler's 22:30 call (POST /api/maintenance/run?trigger=cutoff);
 *        - the scheduler's periodic fallback (…?trigger=fallback, every 5 min);
 *        - server start and busy paths (maybePurgeExpiredOrders).
 *      Every run records when it STARTED and when it FINISHED (after the
 *      deletion and the verified backup clean-up), how long it took, for
 *      which cutoff, how late its start and its completion were after that
 *      cutoff, and what failed (MaintenanceState) — so the real timing is
 *      measured, not assumed. A failed run is never recorded as completed.
 *
 * What goes (rows created at or before the last 22:30):
 *   Order (every status), OrderItem, EmailOutbox, PaymentAttempt,
 *   PaymentAuditEvent, PaymentRefundRecord, PaymentSimulatorSession.
 * The tracking "token" is not stored (lib/order-tracking.ts).
 * What stays: menu, settings, print layouts, users, the order-number counter
 * and this job's own bookkeeping (counts, times, error texts — no order data).
 *
 * Safe any number of times, from any number of processes: it only deletes
 * rows that are already invisible, a DELETE of nothing is a no-op, and a
 * missed evening is caught up because "expired" means "created at or before
 * the LAST cutoff". `secure_delete` zeroes freed pages; the WAL is
 * checkpointed. Outside this disk see IMPLEMENTATION_REPORT.md §5.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { dbUnscoped } from "@/lib/db";
import { lastCutoffAtOrBefore, nextCutoffAfter, orderRetentionEnabled, retentionNow } from "@/lib/order-retention";

export const MAINTENANCE_ROW_ID = "orders";

/** Who started a run — recorded, so the real trigger of each cutoff is known. */
export type PurgeTrigger = "timer" | "cutoff" | "fallback" | "start" | "traffic" | "manual" | "test";

export interface BackupFailure {
  file: string;
  error: string;
}

export interface BackupScrubResult {
  /** Files in which expired rows were found and deleted (and verified). */
  scrubbed: number;
  /** Files checked that held no expired rows. */
  clean: number;
  /** Files that could not be cleaned completely — never counted as scrubbed. */
  failed: BackupFailure[];
}

export interface PurgeSummary {
  ok: boolean;
  /** True when the retention is switched off: nothing was looked at or deleted. */
  disabled?: boolean;
  trigger: PurgeTrigger;
  cutoffAt: string;
  /** When the run began — before anything was deleted. */
  startedAt: string;
  /** When the run ended — after the live deletion AND the verified backup
   *  clean-up (or after the failure that stopped it). */
  finishedAt: string;
  durationMs: number;
  /** Seconds from the cutoff to the START of this run. */
  startLagSeconds: number;
  /** finishedAt, but only when the run COMPLETED without any failure; a
   *  failed run is never reported as a completed clean-up. */
  completedAt: string | null;
  /** Seconds from the cutoff to the completion — null when the run failed. */
  completionLagSeconds: number | null;
  deletedOrders: number;
  deletedSimulatorSessions: number;
  scrubbedBackups: number;
  cleanBackups: number;
  backupFailures: BackupFailure[];
  error: string | null;
}

/** What the work did — the summary without its timing. */
type PurgeOutcome = Pick<
  PurgeSummary,
  "deletedOrders" | "deletedSimulatorSessions" | "scrubbedBackups" | "cleanBackups" | "backupFailures" | "error"
>;

/** The tables that hang off Order, deleted child-first (also cascaded by FK). */
const CHILD_DELETES = [
  "emailOutbox",
  "orderItem",
  "paymentAttempt",
  "paymentAuditEvent",
  "paymentRefundRecord",
] as const;

export interface PurgeOptions {
  trigger?: PurgeTrigger;
  /** Test hook: called inside each backup's transaction before it commits. */
  beforeBackupCommit?: (file: string) => void;
  /** Read again when the run ends, for its finish time (default: the same
   *  clock as `now` — the real clock outside tests). */
  clock?: () => Date;
}

const secondsBetween = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

/** What a run reports while the retention is off: nothing done, nothing failed. */
function disabledSummary(trigger: PurgeTrigger, at: Date): PurgeSummary {
  const t = at.toISOString();
  return {
    ok: true,
    disabled: true,
    trigger,
    cutoffAt: lastCutoffAtOrBefore(at).toISOString(),
    startedAt: t,
    finishedAt: t,
    durationMs: 0,
    startLagSeconds: 0,
    completedAt: null,
    completionLagSeconds: null,
    deletedOrders: 0,
    deletedSimulatorSessions: 0,
    scrubbedBackups: 0,
    cleanBackups: 0,
    backupFailures: [],
    error: null,
  };
}

export async function purgeExpiredOrders(
  now: Date = retentionNow(),
  options: PurgeOptions = {}
): Promise<PurgeSummary> {
  const trigger = options.trigger ?? "manual";
  // History kept: the purge is switched off — return before any query.
  if (!orderRetentionEnabled()) return disabledSummary(trigger, now);
  const startedAt = now;
  const cutoff = lastCutoffAtOrBefore(startedAt);
  const expired = { createdAt: { lte: cutoff } };

  /** Stamps the END of the run — called only after the work has finished. */
  const finish = (ok: boolean, rest: PurgeOutcome): PurgeSummary => {
    const read = (options.clock ?? retentionNow)();
    // A clock that reads earlier than the start (an explicit `now` from
    // another clock) never yields a negative duration.
    const finishedAt = read.getTime() < startedAt.getTime() ? startedAt : read;
    return {
      ok,
      trigger,
      cutoffAt: cutoff.toISOString(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      startLagSeconds: secondsBetween(cutoff, startedAt),
      completedAt: ok ? finishedAt.toISOString() : null,
      completionLagSeconds: ok ? secondsBetween(cutoff, finishedAt) : null,
      ...rest,
    };
  };

  let deletedOrders = 0;
  let deletedSimulatorSessions = 0;
  try {
    try {
      // Zero the freed pages. connection_limit=1 (lib/db.ts) means this is
      // the connection the DELETEs below run on.
      await dbUnscoped.$queryRawUnsafe("PRAGMA secure_delete = ON");
    } catch {
      /* an SQLite without the pragma still deletes the rows */
    }

    ({ deletedOrders, deletedSimulatorSessions } = await dbUnscoped.$transaction(async (tx) => {
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
    }));

    try {
      await dbUnscoped.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* not in WAL mode — nothing to checkpoint */
    }
  } catch (err) {
    const error = `live database: ${String((err as Error).message ?? err).slice(0, 300)}`;
    const summary = finish(false, {
      deletedOrders: 0,
      deletedSimulatorSessions: 0,
      scrubbedBackups: 0,
      cleanBackups: 0,
      backupFailures: [],
      error,
    });
    await recordRun(summary, cutoff);
    console.error(`[retention] purge FAILED (${trigger}): ${error}`);
    return summary;
  }

  const backups = await scrubBackups(cutoff, options);
  const ok = backups.failed.length === 0;
  // The run ends HERE: after the live deletion and the verified backups.
  const summary = finish(ok, {
    deletedOrders,
    deletedSimulatorSessions,
    scrubbedBackups: backups.scrubbed,
    cleanBackups: backups.clean,
    backupFailures: backups.failed,
    error: ok ? null : `backups: ${backups.failed.length} file(s) not cleaned`,
  });
  await recordRun(summary, cutoff);
  if (!ok) {
    // File names and error texts only — no order data.
    console.error(
      `[retention] backup scrub FAILED for ${backups.failed.length} file(s): ` +
        backups.failed.map((f) => `${f.file}: ${f.error}`).join("; ")
    );
  } else if (deletedOrders > 0 || backups.scrubbed > 0) {
    console.info(
      `[retention] purge (${trigger}): started ${summary.startLagSeconds}s and completed ` +
        `${summary.completionLagSeconds}s after the cutoff (${summary.durationMs} ms): ${deletedOrders} order(s) deleted, ` +
        `${backups.scrubbed} backup file(s) cleaned`
    );
  }
  return summary;
}

/**
 * Records the run, AFTER it ended. Start, finish and duration are kept for
 * every run. `lastSuccessAt` is the finish time of a run that completed
 * without failure. The `lastCutoff*` fields move only on a SUCCESSFUL run for
 * a NEW cutoff: they then say when tonight's orders were really deleted (the
 * completion), how late its start and its completion were after 22:30, and
 * by which trigger. A failed run leaves them alone and fills `lastError` /
 * `lastBackupErrors` instead.
 */
async function recordRun(summary: PurgeSummary, cutoff: Date) {
  try {
    const prev = await dbUnscoped.maintenanceState.findUnique({ where: { id: MAINTENANCE_ROW_ID } });
    const firstForCutoff = summary.ok && (!prev?.lastCutoffAt || prev.lastCutoffAt.getTime() < cutoff.getTime());
    const finishedAt = new Date(summary.finishedAt);
    const data = {
      lastRunAt: new Date(summary.startedAt),
      lastTrigger: summary.trigger,
      lastFinishedAt: finishedAt,
      lastDurationMs: summary.durationMs,
      lastDeleted: summary.deletedOrders,
      lastError: summary.error,
      lastBackupsScrubbed: summary.scrubbedBackups,
      lastBackupErrors: summary.backupFailures.length ? JSON.stringify(summary.backupFailures).slice(0, 2000) : null,
      ...(summary.ok && summary.completedAt ? { lastSuccessAt: new Date(summary.completedAt) } : {}),
      ...(firstForCutoff && summary.completedAt
        ? {
            lastCutoffAt: cutoff,
            lastCutoffStartLagSeconds: summary.startLagSeconds,
            lastCutoffCompletedAt: new Date(summary.completedAt),
            lastCutoffCompletionLagSeconds: summary.completionLagSeconds,
            lastCutoffTrigger: summary.trigger,
          }
        : {}),
    };
    await dbUnscoped.maintenanceState.upsert({
      where: { id: MAINTENANCE_ROW_ID },
      create: { id: MAINTENANCE_ROW_ID, ...data },
      update: data,
    });
  } catch (err) {
    console.error("[retention] could not record the run:", (err as Error).message);
  }
}

/** The live database file, or null when DATABASE_URL is not a SQLite file. */
function databaseFile(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const raw = url.slice("file:".length).split("?")[0];
  return path.isAbsolute(raw) ? raw : path.resolve("prisma", raw);
}

/** Where the pre-migration / manual backups live (scripts/backup-db.mjs). */
export function backupsDir(): string | null {
  const dbFile = databaseFile();
  return dbFile ? path.join(path.dirname(dbFile), "backups") : null;
}

// ── Backups: cleaned by CONTENT, not by file date ───────────────────────────
//
// A copy may be written at any time — also after a cutoff — and may hold
// orders from before it (a backup taken at 23:00 holds today's expired
// orders; a manual copy may hold weeks). So each file is opened and every
// order created at or before the cutoff is deleted with its dependent rows,
// while orders still live today and the unrelated tables (menu, settings,
// users) are kept. The schema of an old copy may lack tables or columns:
// what exists is read from sqlite_master / PRAGMA table_info first, so a
// MISSING table is skipped deliberately, and any OTHER error is a failure.
//
// Dates: Prisma stores DateTime as integer milliseconds; rows written by a
// SQL migration (CURRENT_TIMESTAMP) are text. Both are compared.

const ORDER_CHILD_TABLES = ["EmailOutbox", "OrderItem", "PaymentAttempt", "PaymentAuditEvent", "PaymentRefundRecord"];

function expiredPredicate(column: string): string {
  return (
    `((typeof("${column}") IN ('integer','real') AND "${column}" <= ?1)` +
    ` OR (typeof("${column}") = 'text' AND julianday("${column}") <= julianday(?2)))`
  );
}

type RawClient = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

async function tablesOf(client: RawClient): Promise<Set<string>> {
  const rows = await client.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table'`
  );
  return new Set(rows.map((r) => r.name));
}

async function hasColumn(client: RawClient, table: string, column: string): Promise<boolean> {
  const cols = await client.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`);
  return cols.some((c) => c.name === column);
}

async function countExpired(client: RawClient, tables: Set<string>, ms: number, iso: string) {
  let orders = 0;
  let orphans = 0;
  let sessions = 0;
  if (tables.has("Order")) {
    const r = await client.$queryRawUnsafe<{ n: bigint | number }[]>(
      `SELECT COUNT(*) AS n FROM "Order" WHERE ${expiredPredicate("createdAt")}`,
      ms,
      iso
    );
    orders = Number(r[0]?.n ?? 0);
    for (const t of ORDER_CHILD_TABLES) {
      if (!tables.has(t) || !(await hasColumn(client, t, "orderId"))) continue;
      const o = await client.$queryRawUnsafe<{ n: bigint | number }[]>(
        `SELECT COUNT(*) AS n FROM "${t}" WHERE "orderId" NOT IN (SELECT "id" FROM "Order") OR "orderId" IN (SELECT "id" FROM "Order" WHERE ${expiredPredicate("createdAt")})`,
        ms,
        iso
      );
      orphans += Number(o[0]?.n ?? 0);
    }
  }
  if (tables.has("PaymentSimulatorSession")) {
    const s = await client.$queryRawUnsafe<{ n: bigint | number }[]>(
      `SELECT COUNT(*) AS n FROM "PaymentSimulatorSession" WHERE ${expiredPredicate("createdAt")}`,
      ms,
      iso
    );
    sessions = Number(s[0]?.n ?? 0);
  }
  return { orders, orphans, sessions, total: orders + orphans + sessions };
}

export async function scrubBackups(cutoff: Date, options: PurgeOptions = {}): Promise<BackupScrubResult> {
  const result: BackupScrubResult = { scrubbed: 0, clean: 0, failed: [] };
  // History kept: no backup file is opened, let alone changed.
  if (!orderRetentionEnabled()) return result;
  const dir = backupsDir();
  if (!dir || !existsSync(dir)) return result;
  const ms = cutoff.getTime();
  const iso = cutoff.toISOString();

  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".db")) continue;
    const file = path.join(dir, name);
    const client = new PrismaClient({ datasources: { db: { url: `file:${file}?connection_limit=1` } } });
    try {
      const tables = await tablesOf(client);
      const before = await countExpired(client, tables, ms, iso);
      if (before.total === 0) {
        result.clean++;
        continue;
      }

      await client.$queryRawUnsafe("PRAGMA secure_delete = ON").catch(() => undefined);
      // All deletions of one file commit together or not at all: an
      // interrupted run leaves the file as it was, and the next run redoes it.
      await client.$transaction(async (tx) => {
        if (tables.has("Order")) {
          for (const t of ORDER_CHILD_TABLES) {
            if (!tables.has(t)) continue; // an older schema: the table never existed
            if (!(await hasColumn(tx, t, "orderId"))) continue;
            await tx.$executeRawUnsafe(
              `DELETE FROM "${t}" WHERE "orderId" NOT IN (SELECT "id" FROM "Order") OR "orderId" IN (SELECT "id" FROM "Order" WHERE ${expiredPredicate("createdAt")})`,
              ms,
              iso
            );
          }
          await tx.$executeRawUnsafe(`DELETE FROM "Order" WHERE ${expiredPredicate("createdAt")}`, ms, iso);
        }
        if (tables.has("PaymentSimulatorSession")) {
          await tx.$executeRawUnsafe(
            `DELETE FROM "PaymentSimulatorSession" WHERE ${expiredPredicate("createdAt")}`,
            ms,
            iso
          );
        }
        options.beforeBackupCommit?.(name);
      });

      // Verify instead of trusting the statements.
      const after = await countExpired(client, tables, ms, iso);
      if (after.total !== 0) {
        result.failed.push({ file: name, error: `${after.total} expired row(s) still present after cleaning` });
        continue;
      }
      await client.$executeRawUnsafe("VACUUM");
      result.scrubbed++;
    } catch (err) {
      result.failed.push({ file: name, error: String((err as Error).message ?? err).replace(/\s+/g, " ").slice(0, 300) });
    } finally {
      await client.$disconnect().catch(() => undefined);
    }
  }
  return result;
}

// ── Triggers inside the web process ─────────────────────────────────────────

const SWEEP_EVERY_MS = 10 * 60 * 1000;
const state = globalThis as unknown as {
  __ppPurge?: { cutoff: number; at: number; running: boolean; ok: boolean };
  __ppPurgeTimer?: ReturnType<typeof setTimeout>;
};

/**
 * Runs the purge if this process has not purged successfully since the last
 * cutoff (or not for ten minutes, or the last run failed). Cheap enough for
 * busy paths; never throws.
 */
export async function maybePurgeExpiredOrders(
  now: Date = retentionNow(),
  trigger: PurgeTrigger = "traffic"
): Promise<void> {
  if (!orderRetentionEnabled()) return;
  const cutoff = lastCutoffAtOrBefore(now).getTime();
  const s = (state.__ppPurge ??= { cutoff: 0, at: 0, running: false, ok: false });
  if (s.running) return;
  if (s.ok && s.cutoff === cutoff && now.getTime() - s.at < SWEEP_EVERY_MS) return;
  s.running = true;
  try {
    const r = await purgeExpiredOrders(now, { trigger });
    s.cutoff = cutoff;
    s.at = now.getTime();
    s.ok = r.ok;
  } catch (err) {
    s.ok = false;
    console.error("[retention] purge failed:", (err as Error).message);
  } finally {
    s.running = false;
  }
}

/**
 * The in-process 22:30 timer: while the web process is up, the purge runs at
 * 22:30:01 Sofia time, then re-arms for the next day. NOT the only trigger
 * (a sleeping or restarting process misses it) — the scheduler's calls and
 * the start-up run cover that.
 */
export function scheduleCutoffPurge(): void {
  // History kept: no 22:30 timer is armed.
  if (!orderRetentionEnabled()) return;
  if (state.__ppPurgeTimer) return;
  const arm = () => {
    const now = new Date();
    const delay = Math.max(1_000, nextCutoffAfter(now).getTime() - now.getTime() + 1_000);
    state.__ppPurgeTimer = setTimeout(async () => {
      state.__ppPurgeTimer = undefined;
      await purgeExpiredOrders(new Date(), { trigger: "timer" }).catch((err) =>
        console.error("[retention] timer purge failed:", (err as Error).message)
      );
      arm();
    }, delay);
    // Never keep the process alive just for this timer.
    state.__ppPurgeTimer.unref?.();
  };
  arm();
}

/** For the admin and the post-deploy check: what the last runs did. */
export async function getPurgeState() {
  return dbUnscoped.maintenanceState.findUnique({ where: { id: MAINTENANCE_ROW_ID } });
}
