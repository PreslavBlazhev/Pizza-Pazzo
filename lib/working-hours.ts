/**
 * Opening-hours presentation: turns the structured week into the rows the
 * footer, the contacts page and the admin display show, and into schema.org
 * OpeningHoursSpecification entries.
 *
 * Consecutive days with identical hours are grouped ("Понеделник – Събота"),
 * which is how the restaurant states them. Grouping is strictly by adjacency in
 * Monday → Sunday order: a Tuesday and a Thursday that happen to share hours
 * are never merged, because "Вторник – Четвъртък" would then be a lie about
 * Wednesday.
 *
 * Pure and dependency-free (relative imports only) so scripts/smoke-checkout.mjs
 * can compile and unit-test it.
 */
import { WEEKDAYS, type RestaurantHours, type Weekday } from "../types/settings";

/** schema.org day names, by weekday key. */
const SCHEMA_DAY: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** One rendered row: a single day or a run of identical consecutive days. */
export interface WorkingHoursRow {
  /** The days this row covers, in order. */
  days: Weekday[];
  /** True when the whole run is closed. */
  closed: boolean;
  /** "11:00 – 23:00", or null for a closed run. */
  hours: string | null;
}

/** True when two days have exactly the same opening state and bounds. */
function sameHours(
  a: { open: boolean; from: string | null; to: string | null },
  b: { open: boolean; from: string | null; to: string | null }
): boolean {
  if (a.open !== b.open) return false;
  if (!a.open) return true; // both closed — the times are irrelevant
  return a.from === b.from && a.to === b.to;
}

/**
 * Collapses the week into display rows, preserving Monday → Sunday order.
 * Never merges non-adjacent days.
 */
export function groupWorkingHours(hours: RestaurantHours): WorkingHoursRow[] {
  const rows: WorkingHoursRow[] = [];

  for (const day of WEEKDAYS) {
    const value = hours[day];
    const previous = rows[rows.length - 1];
    const previousDay = previous?.days[previous.days.length - 1];

    if (previous && previousDay && sameHours(hours[previousDay], value)) {
      previous.days.push(day);
      continue;
    }

    rows.push({
      days: [day],
      closed: !value.open,
      hours: value.open && value.from && value.to ? `${value.from} – ${value.to}` : null,
    });
  }

  return rows;
}

/**
 * Label for a grouped row, given a translator for the weekday names:
 * "Понеделник", or "Понеделник – Събота" for a run.
 */
export function workingHoursRowLabel(
  row: WorkingHoursRow,
  dayName: (day: Weekday) => string
): string {
  const first = dayName(row.days[0]);
  if (row.days.length === 1) return first;
  return `${first} – ${dayName(row.days[row.days.length - 1])}`;
}

/** One schema.org OpeningHoursSpecification entry. */
export interface OpeningHoursSpecification {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

/**
 * schema.org opening hours — open days only. A closed day is simply absent
 * (never emitted with empty `opens`/`closes`), and an all-closed week yields
 * an empty array.
 */
export function toOpeningHoursSpecification(
  hours: RestaurantHours
): OpeningHoursSpecification[] {
  return groupWorkingHours(hours)
    .filter((row) => !row.closed && row.hours)
    .map((row) => {
      const day = hours[row.days[0]];
      return {
        "@type": "OpeningHoursSpecification" as const,
        dayOfWeek: row.days.map((d) => SCHEMA_DAY[d]),
        opens: day.from as string,
        closes: day.to as string,
      };
    });
}

/** `tel:` href — strips spaces and separators, keeps a leading "+". */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return `tel:${plus}${trimmed.replace(/[^\d]/g, "")}`;
}
