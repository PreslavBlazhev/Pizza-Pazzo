/**
 * Europe/Sofia calendar arithmetic for the admin report.
 *
 * The database stores every timestamp in UTC and the Render container runs in
 * UTC, but the restaurant thinks in Sofia days: "днес" must mean 00:00–24:00
 * local, not 03:00–03:00. Everything here therefore converts explicitly through
 * `Intl.DateTimeFormat` with `timeZone: "Europe/Sofia"` and NEVER touches the
 * process timezone (`new Date().setHours(0,0,0,0)` is exactly the bug this
 * replaces).
 *
 * Ranges are half-open — `[from, toExclusive)` — so a day boundary can never
 * include or drop a row twice, and "до 31.07 включително" is expressed as
 * "< 01.08 00:00 Sofia" rather than 23:59:59.999.
 *
 * Pure and dependency-free (relative imports only, no next-intl, no `@/`
 * alias) so scripts/smoke-checkout.mjs can compile and unit-test it.
 */

export const SOFIA_TIME_ZONE = "Europe/Sofia";

/** Wall-clock fields of an instant, as seen in Sofia. */
interface SofiaParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
}

// `hourCycle: "h23"` keeps midnight at "00" — some ICU builds render it as
// "24" with hour12:false, which would silently shift a day.
const SOFIA_PARTS_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: SOFIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Reads an instant's Sofia wall-clock fields. */
export function sofiaParts(at: Date): SofiaParts {
  const parts = SOFIA_PARTS_FORMAT.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Sofia's UTC offset in milliseconds at the given instant (DST-aware). */
function sofiaOffsetMs(at: Date): number {
  const p = sofiaParts(at);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second noise: the formatter has no millisecond field.
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Turns a Sofia wall-clock moment into the UTC instant it refers to.
 *
 * Two passes: the first guess assumes the wall clock is UTC, the second
 * re-reads the offset at the corrected instant. That second pass is what makes
 * the DST changeovers exact — around them the offset differs on either side of
 * the guess. Sofia switches at 03:00/04:00 local, so midnight (all this module
 * asks for) is never ambiguous or non-existent.
 */
export function sofiaWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = guess - sofiaOffsetMs(new Date(guess));
  const secondPass = guess - sofiaOffsetMs(new Date(firstPass));
  return new Date(secondPass);
}

/** Start of the Sofia calendar day containing `at`. */
export function startOfSofiaDay(at: Date): Date {
  const p = sofiaParts(at);
  return sofiaWallClockToUtc(p.year, p.month, p.day);
}

/** Start of the Sofia day `days` after the day containing `at`. */
export function addSofiaDays(at: Date, days: number): Date {
  const p = sofiaParts(at);
  // Date.UTC normalises overflow (e.g. 32 January → 1 February), and the
  // wall-clock conversion re-applies the correct offset for the new date.
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return sofiaWallClockToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate()
  );
}

/** Start of the ISO week (Monday 00:00 Sofia) containing `at`. */
export function startOfSofiaWeek(at: Date): Date {
  const p = sofiaParts(at);
  // getUTCDay on the wall-clock date gives the weekday as seen in Sofia.
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7; // Sunday(0) → 6, Monday(1) → 0
  return addSofiaDays(at, -daysSinceMonday);
}

/** Start of the Sofia month containing `at`. */
export function startOfSofiaMonth(at: Date): Date {
  const p = sofiaParts(at);
  return sofiaWallClockToUtc(p.year, p.month, 1);
}

/** Start of the Sofia year containing `at`. */
export function startOfSofiaYear(at: Date): Date {
  const p = sofiaParts(at);
  return sofiaWallClockToUtc(p.year, 1, 1);
}

// ── "YYYY-MM-DD" (a Sofia calendar date) ────────────────────────────────────

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a strict YYYY-MM-DD, rejecting non-existent dates like 2026-02-31. */
export function parseSofiaDateString(
  value: string
): { year: number; month: number; day: number } | null {
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Round-trip through UTC: 2026-02-31 normalises to March 3, so the fields
  // coming back differ — that is how an impossible calendar date is caught.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** "YYYY-MM-DD" → the UTC instant of that Sofia day's 00:00. Null if invalid. */
export function sofiaDateStringToUtcStart(value: string): Date | null {
  const parsed = parseSofiaDateString(value);
  if (!parsed) return null;
  return sofiaWallClockToUtc(parsed.year, parsed.month, parsed.day);
}

/** The Sofia calendar date of an instant, as "YYYY-MM-DD". */
export function toSofiaDateString(at: Date): string {
  const p = sofiaParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Whole Sofia days between two day-starts (used for the range cap). */
export function sofiaDaysBetween(fromDayStart: Date, toDayStart: Date): number {
  return Math.round((toDayStart.getTime() - fromDayStart.getTime()) / 86_400_000);
}

// ── Report ranges ───────────────────────────────────────────────────────────

export const REPORT_PERIODS = ["day", "week", "month", "year"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function isReportPeriod(value: unknown): value is ReportPeriod {
  return typeof value === "string" && (REPORT_PERIODS as readonly string[]).includes(value);
}

/** Longest custom range the report will run (calendar days, inclusive). */
export const MAX_REPORT_RANGE_DAYS = 366;

/** A resolved, half-open range ready for a Prisma `createdAt` filter. */
export interface ReportRange {
  from: Date;
  /** Exclusive upper bound — use `lt`, never `lte`. */
  toExclusive: Date;
  /** Sofia calendar date of `from`, "YYYY-MM-DD". */
  fromDate: string;
  /** Sofia calendar date of the LAST included day, "YYYY-MM-DD". */
  toDate: string;
}

/** Range for a preset period: its start in Sofia → now. */
export function resolvePresetRange(period: ReportPeriod, now: Date): ReportRange {
  const from =
    period === "day"
      ? startOfSofiaDay(now)
      : period === "week"
        ? startOfSofiaWeek(now)
        : period === "month"
          ? startOfSofiaMonth(now)
          : startOfSofiaYear(now);

  // The upper bound is "now", but expressed as the start of tomorrow it would
  // include future-dated rows; `now` itself is the honest exclusive bound.
  return {
    from,
    toExclusive: now,
    fromDate: toSofiaDateString(from),
    toDate: toSofiaDateString(now),
  };
}

/**
 * Range for a custom from/to pair, both Sofia calendar dates and both
 * INCLUSIVE — the exclusive bound is the start of the day after `to`.
 */
export function resolveCustomRange(
  fromDate: string,
  toDate: string
): ReportRange | null {
  const from = sofiaDateStringToUtcStart(fromDate);
  const toStart = sofiaDateStringToUtcStart(toDate);
  if (!from || !toStart) return null;
  if (toStart.getTime() < from.getTime()) return null;
  if (sofiaDaysBetween(from, toStart) + 1 > MAX_REPORT_RANGE_DAYS) return null;
  return {
    from,
    toExclusive: addSofiaDays(toStart, 1),
    fromDate: toSofiaDateString(from),
    toDate: toSofiaDateString(toStart),
  };
}

/** Human-readable Sofia date, e.g. "26.07.2026" (BG) / "26/07/2026" (EN). */
export function formatSofiaDate(at: Date, locale = "bg"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bg-BG", {
    timeZone: SOFIA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(at);
}
