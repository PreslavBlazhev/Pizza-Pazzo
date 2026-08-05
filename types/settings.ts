/**
 * Restaurant settings — the plain, serializable shape every component sees.
 *
 * The Prisma row stores one flat column per weekday (SQLite has no arrays);
 * `lib/restaurant-settings.ts` maps it into the structured form below, so no
 * UI ever deals with `mondayFrom` / `tuesdayFrom` / … by hand.
 *
 * Times are "HH:mm" strings in the restaurant's local time. A closed day has
 * `open: false` and both bounds null.
 */
import type { ForcedOpening, ManualClosure } from "./store-status";

/** Weekday keys, always in display order: Monday → Sunday. */
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && (WEEKDAYS as readonly string[]).includes(value);
}

/** One day's opening hours. */
export interface WorkingHoursDay {
  open: boolean;
  /** "HH:mm", or null when the day is closed. */
  from: string | null;
  to: string | null;
}

/** The whole week, keyed by weekday. */
export type RestaurantHours = Record<Weekday, WorkingHoursDay>;

/** Contact details shown to customers. */
export interface RestaurantContact {
  addressBg: string;
  addressEn: string;
  primaryPhone: string;
  /** Empty string when the restaurant publishes only one number. */
  secondaryPhone: string;
  /**
   * Public, customer-facing address. NOT the Resend sender or the order
   * notification recipient — those stay in environment variables.
   */
  contactEmail: string;
}

/** Everything the admin settings page reads and writes. */
export interface RestaurantSettingsData extends RestaurantContact {
  hours: RestaurantHours;
}

/**
 * The whole settings row: the editable settings plus the two manual
 * overrides — the closure and the forced opening.
 *
 * They live in one database row but are edited by different screens, so they
 * are kept apart here — saving the contact form must never touch an override,
 * and closing the shop must never rewrite the address.
 */
export interface RestaurantState {
  settings: RestaurantSettingsData;
  closure: ManualClosure;
  forcedOpening: ForcedOpening;
}
