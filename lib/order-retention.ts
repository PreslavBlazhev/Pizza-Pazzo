/**
 * Daily order retention — WHEN an order stops existing.
 *
 * The owner's rule (2026-10-17): orders exist only for the day they were
 * placed. Every evening at 22:30 Europe/Sofia every list is empty — new,
 * accepted, cancelled, delivered and unfinished orders alike.
 *
 * This module only answers time questions; it never touches the database.
 * Three layers build on it:
 *
 *   1. lib/db.ts — every read and every write of an order (and of its lines,
 *      payments, e-mail jobs) is limited to orders placed after the last
 *      22:30. An expired order therefore cannot be read, changed, printed or
 *      e-mailed from the very second the cutoff passes, even if the deleting
 *      job is late or has not run at all.
 *   2. lib/order-purge.ts — physically deletes the expired rows (cron job,
 *      server start, and a throttled sweep piggy-backing on normal traffic).
 *   3. lib/store-hours.ts — between 22:30 and midnight no order can be
 *      placed, whatever the opening hours or a forced opening say, so an
 *      order is never created into a day that has already ended.
 *
 * Sofia time is read through Intl (lib/report-period.ts), so summer and
 * winter time are handled by the time-zone database, never by a fixed
 * offset. Sofia changes its clocks at 03:00/04:00, so 22:30 always exists
 * exactly once a day.
 *
 * Pure and dependency-free (relative imports only): the browser uses the same
 * functions to clear an open screen at the cutoff.
 */
import { sofiaParts, sofiaWallClockToUtc } from "./report-period";

/** The daily cutoff, Sofia wall clock. */
export const ORDER_CUTOFF = { hour: 22, minute: 30 } as const;

/** "22:30" — for messages. */
export const ORDER_CUTOFF_LABEL = `${String(ORDER_CUTOFF.hour).padStart(2, "0")}:${String(
  ORDER_CUTOFF.minute
).padStart(2, "0")}`;

/** The 22:30 of the Sofia calendar day `offsetDays` after the one holding `at`. */
function cutoffOfSofiaDay(at: Date, offsetDays: number): Date {
  const p = sofiaParts(at);
  // Date.UTC normalises day overflow (31 + 1 → the 1st of next month).
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays));
  return sofiaWallClockToUtc(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    ORDER_CUTOFF.hour,
    ORDER_CUTOFF.minute
  );
}

/**
 * The most recent cutoff at or before `now`. Every order created at or
 * before this instant has expired.
 */
export function lastCutoffAtOrBefore(now: Date): Date {
  const today = cutoffOfSofiaDay(now, 0);
  return today.getTime() <= now.getTime() ? today : cutoffOfSofiaDay(now, -1);
}

/** The first cutoff strictly after `at`. */
export function nextCutoffAfter(at: Date): Date {
  const today = cutoffOfSofiaDay(at, 0);
  return today.getTime() > at.getTime() ? today : cutoffOfSofiaDay(at, 1);
}

/** When an order created at `createdAt` expires (and is deleted). */
export function orderExpiresAt(createdAt: Date): Date {
  return nextCutoffAfter(createdAt);
}

/** True while an order created at `createdAt` still exists for everyone. */
export function isOrderLive(createdAt: Date, now: Date): boolean {
  return createdAt.getTime() > lastCutoffAtOrBefore(now).getTime();
}

/**
 * True between 22:30 and midnight (Sofia): the day is over, so no order may
 * be placed — it would belong to a day whose lists are already empty. After
 * midnight the next day's opening hours decide again.
 */
export function isAfterDailyCutoff(now: Date): boolean {
  return cutoffOfSofiaDay(now, 0).getTime() <= now.getTime();
}

/** The next Sofia midnight after `now` — when ordering may resume at the earliest. */
export function nextSofiaMidnight(now: Date): Date {
  const p = sofiaParts(now);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return sofiaWallClockToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
}

/**
 * The clock every retention decision uses. Tests move it (they must be able to
 * stand at 22:29:59 and at 22:30:00 without waiting for the evening); outside
 * NODE_ENV=test the override is ignored, so production always reads the real
 * clock.
 */
const CLOCK_KEY = "__ppRetentionNow";
/** A shift (ms) added to the real clock — tests/setup-env.mjs moves the suites to the morning. */
const OFFSET_KEY = "__ppRetentionOffsetMs";

export function retentionNow(): Date {
  if (process.env.NODE_ENV === "test") {
    const g = globalThis as Record<string, unknown>;
    const fixed = g[CLOCK_KEY];
    if (fixed instanceof Date) return new Date(fixed.getTime());
    const offset = g[OFFSET_KEY];
    if (typeof offset === "number") return new Date(Date.now() + offset);
  }
  return new Date();
}

/** Test helper: pins the retention clock (null = real clock again). */
export function setRetentionClockForTests(at: Date | null): void {
  (globalThis as Record<string, unknown>)[CLOCK_KEY] = at ?? undefined;
}
