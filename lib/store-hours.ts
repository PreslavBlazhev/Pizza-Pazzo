/**
 * "Is the restaurant taking orders right now, and if not, when again?"
 *
 * Two independent things can close the shop:
 *   1. the opening hours (`RestaurantHours`) — the kitchen is simply not
 *      working at this hour;
 *   2. a manual closure — someone pressed "Затвори заведението" in the admin
 *      panel, either for a set time or until they reopen by hand.
 *
 * A manual closure OUTRANKS the hours: it can close a shop that would
 * otherwise be open, never the other way round. It cannot open one that the
 * hours say is closed, which is why a timer expiring at 02:00 does not start
 * taking orders — `nextOpeningAfter` moves the reopen to the next real
 * opening.
 *
 * Nothing here writes anything. A timed closure ends because `now` moved past
 * `until`, not because a job cleared a flag, so there is no cron and no way
 * for the shop to stay stuck closed if a background task fails to run.
 *
 * All calendar arithmetic goes through `report-period.ts`, i.e. explicitly
 * through Europe/Sofia — the Render container runs in UTC, so a bare
 * `setHours` would put the boundary three hours off.
 *
 * Pure and dependency-free (relative imports only, no `@/` alias, no
 * next-intl) so scripts/smoke-checkout.mjs can compile and unit-test it.
 */
import { WEEKDAYS, type RestaurantHours, type Weekday } from "../types/settings";
import type { StoreStatus } from "../types/store-status";
import { addSofiaDays, sofiaParts, sofiaWallClockToUtc } from "./report-period";

/** How far ahead to look for the next opening. */
const SEARCH_DAYS = 8;

/** "HH:mm" → minutes since midnight, or null when unusable. */
function parseHhMm(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** One day's open window as real instants. */
export interface HoursWindow {
  opensAt: Date;
  closesAt: Date;
}

/**
 * The open window of the Sofia calendar day `dayOffset` days from `at`, or
 * null when that day is closed or its stored times are unusable.
 *
 * Windows never cross midnight: the settings validator rejects `from >= to`,
 * so a day's window always ends on the same calendar day it starts.
 */
function windowForDay(
  hours: RestaurantHours,
  at: Date,
  dayOffset: number
): HoursWindow | null {
  const dayStart = addSofiaDays(at, dayOffset);
  const { year, month, day } = sofiaParts(dayStart);

  // getUTCDay of the bare wall-clock date is the weekday as seen in Sofia.
  const index = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday: Weekday = WEEKDAYS[(index + 6) % 7]; // Sunday(0) → last
  const value = hours[weekday];
  if (!value || !value.open) return null;

  const from = parseHhMm(value.from);
  const to = parseHhMm(value.to);
  if (from === null || to === null || to <= from) return null;

  return {
    opensAt: sofiaWallClockToUtc(year, month, day, Math.floor(from / 60), from % 60),
    closesAt: sofiaWallClockToUtc(year, month, day, Math.floor(to / 60), to % 60),
  };
}

export interface HoursStatus {
  open: boolean;
  /** Today's closing instant while open, else null. */
  closesAt: Date | null;
  /** Next opening instant while closed; null if no day of the week is open. */
  nextOpenAt: Date | null;
}

/** Whether the opening hours alone have the shop open at `now`. */
export function resolveHoursStatus(hours: RestaurantHours, now: Date): HoursStatus {
  const time = now.getTime();

  // Only today can contain `now`: `windowForDay` rejects `to <= from`, so no
  // window ever runs past midnight into the next day.
  const today = windowForDay(hours, now, 0);
  if (today && time >= today.opensAt.getTime() && time < today.closesAt.getTime()) {
    return { open: true, closesAt: today.closesAt, nextOpenAt: null };
  }

  return { open: false, closesAt: null, nextOpenAt: nextOpeningAfter(hours, now) };
}

/**
 * The first instant at or after `at` when the shop is open by its hours.
 * Returns `at` itself when that moment is already inside a window, and null
 * when no day in the coming week is open.
 */
export function nextOpeningAfter(hours: RestaurantHours, at: Date): Date | null {
  const time = at.getTime();

  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    const window = windowForDay(hours, at, offset);
    if (!window) continue;
    if (time < window.opensAt.getTime()) return window.opensAt;
    if (time < window.closesAt.getTime()) return at;
  }

  return null;
}

/** The manual closure, reduced to what the decision actually needs. */
export interface ManualClosureState {
  active: boolean;
  /** Null while active means "until reopened by hand". */
  until: Date | null;
}

/**
 * The one function the rest of the app asks: open or closed, why, and until
 * when. `now` is injected rather than read from the clock so this stays
 * testable and so every caller in one request agrees on the time.
 */
export function resolveStoreStatus(
  hours: RestaurantHours,
  closure: ManualClosureState,
  now: Date
): StoreStatus {
  const serverTime = now.toISOString();

  // An expired timer is simply not a closure any more — the row keeps its
  // stale `manuallyClosed = true` until someone next touches it, and that is
  // deliberate: reopening must not depend on a write succeeding.
  const manualActive =
    closure.active && (closure.until === null || closure.until.getTime() > now.getTime());

  if (manualActive) {
    if (closure.until === null) {
      return {
        isOpen: false,
        reason: "manual_indefinite",
        reopensAt: null,
        needsManualReopen: true,
        serverTime,
      };
    }

    // The timer says when the pause ends; the hours say whether anyone is
    // there to cook. Orders resume at the later of the two.
    const reopensAt = nextOpeningAfter(hours, closure.until);
    return {
      isOpen: false,
      reason: "manual_timed",
      reopensAt: reopensAt ? reopensAt.toISOString() : null,
      // Only if the week has no open day at all is a human needed here.
      needsManualReopen: reopensAt === null,
      serverTime,
    };
  }

  const byHours = resolveHoursStatus(hours, now);
  if (!byHours.open) {
    return {
      isOpen: false,
      reason: "hours",
      reopensAt: byHours.nextOpenAt ? byHours.nextOpenAt.toISOString() : null,
      needsManualReopen: false,
      serverTime,
    };
  }

  return {
    isOpen: true,
    reason: null,
    reopensAt: null,
    needsManualReopen: false,
    serverTime,
  };
}

// ── Presentation helpers (shared by the customer dialog and the admin panel) ──

/** "21:30" in Sofia time, whatever timezone the reader's device is in. */
export function formatSofiaTime(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/**
 * Whole Sofia calendar days from `from` to `to` — 0 today, 1 tomorrow, and so
 * on. Drives the "днес / утре / на 12.08" wording, which is why it counts
 * calendar days rather than 24-hour spans: 23:00 → 01:00 is "утре".
 */
export function sofiaDayOffset(from: Date, to: Date): number {
  const a = sofiaParts(from);
  const b = sofiaParts(to);
  const startA = Date.UTC(a.year, a.month - 1, a.day);
  const startB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((startB - startA) / 86_400_000);
}
