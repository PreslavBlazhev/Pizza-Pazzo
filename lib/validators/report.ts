import { z } from "zod";
import {
  MAX_REPORT_RANGE_DAYS,
  REPORT_PERIODS,
  parseSofiaDateString,
  resolveCustomRange,
  resolvePresetRange,
  toSofiaDateString,
  type ReportPeriod,
  type ReportRange,
} from "@/lib/report-period";

/**
 * Admin report search-param validation (zod v4).
 *
 * The report is a GET page, so its input is whatever a URL happens to contain.
 * Nothing here throws or 500s: an unusable parameter degrades to the default
 * daily view and reports a warning code the page can show discreetly.
 *
 * Page size is deliberately NOT part of the contract — it is fixed server-side
 * so a crafted URL cannot ask for every order at once.
 */

/** Fixed number of orders per page. Never read from the URL. */
export const REPORT_PAGE_SIZE = 50;

const dateOnly = z
  .string()
  .trim()
  .refine((v) => parseSofiaDateString(v) !== null, {
    message: "Датата трябва да е валидна и във формат ГГГГ-ММ-ДД.",
  });

export const reportSearchParamsSchema = z.object({
  period: z.enum(REPORT_PERIODS).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  page: z
    .string()
    .trim()
    .regex(/^\d+$/, "Страницата трябва да е цяло положително число.")
    .transform((v) => Number(v))
    .refine((n) => Number.isSafeInteger(n) && n >= 1, {
      message: "Страницата трябва да е поне 1.",
    })
    .optional(),
});

/** Why a requested range was not used (shown to the admin, i18n key suffix). */
export type ReportWarning = "invalidRange" | "maxRange";

export interface ResolvedReportQuery {
  /** The preset in effect, or null when a custom range is shown. */
  period: ReportPeriod | null;
  /** Custom range inputs echoed back into the form (Sofia calendar dates). */
  from: string | null;
  to: string | null;
  page: number;
  range: ReportRange;
  warning: ReportWarning | null;
}

/** Raw `searchParams` as Next.js hands them over. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Normalises the URL into a range the queries can trust.
 *
 * Precedence: a fully valid `from`+`to` pair wins; otherwise the `period`
 * preset; otherwise today. A custom range that is backwards, too long or
 * entirely in the future falls back to the daily view with a warning.
 */
export function resolveReportQuery(
  raw: RawSearchParams,
  now: Date = new Date()
): ResolvedReportQuery {
  const parsed = reportSearchParamsSchema.safeParse({
    period: first(raw.period),
    from: first(raw.from),
    to: first(raw.to),
    page: first(raw.page),
  });

  const data = parsed.success ? parsed.data : {};
  const page = data.page ?? 1;
  const today = toSofiaDateString(now);

  const wantsCustom = Boolean(data.from || data.to);
  if (wantsCustom) {
    // Both halves must be present and valid; a lone date is not a range.
    if (!data.from || !data.to) {
      return dayFallback(now, page, "invalidRange", data.from ?? null, data.to ?? null);
    }
    // A range starting after today has nothing to show; clamp the end to today
    // instead of querying the future, but refuse an all-future start.
    if (data.from > today) {
      return dayFallback(now, page, "invalidRange", data.from, data.to);
    }
    const clampedTo = data.to > today ? today : data.to;
    if (clampedTo < data.from) {
      return dayFallback(now, page, "invalidRange", data.from, data.to);
    }

    const range = resolveCustomRange(data.from, clampedTo);
    if (!range) {
      // resolveCustomRange only fails on order or the length cap here.
      const tooLong = isLongerThanCap(data.from, clampedTo);
      return dayFallback(
        now,
        page,
        tooLong ? "maxRange" : "invalidRange",
        data.from,
        data.to
      );
    }
    return { period: null, from: range.fromDate, to: range.toDate, page, range, warning: null };
  }

  const period: ReportPeriod = data.period ?? "day";
  return {
    period,
    from: null,
    to: null,
    page,
    range: resolvePresetRange(period, now),
    warning: parsed.success ? null : softWarning(raw),
  };
}

/** True when the inclusive span exceeds the cap (both dates already valid). */
function isLongerThanCap(from: string, to: string): boolean {
  const a = parseSofiaDateString(from);
  const b = parseSofiaDateString(to);
  if (!a || !b) return false;
  const days =
    Math.round(
      (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
        86_400_000
    ) + 1;
  return days > MAX_REPORT_RANGE_DAYS;
}

function dayFallback(
  now: Date,
  page: number,
  warning: ReportWarning,
  from: string | null,
  to: string | null
): ResolvedReportQuery {
  return {
    period: "day",
    // Echo the attempted values back so the admin can correct them in place.
    from,
    to,
    page,
    range: resolvePresetRange("day", now),
    warning,
  };
}

/** A malformed period/page alone is silent; a malformed date is worth saying. */
function softWarning(raw: RawSearchParams): ReportWarning | null {
  return first(raw.from) || first(raw.to) ? "invalidRange" : null;
}
