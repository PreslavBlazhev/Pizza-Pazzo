/**
 * Restaurant settings data access — SERVER ONLY.
 *
 * The database is the primary source; `lib/constants.ts` survives only as the
 * fallback used when the settings row is missing or unreadable, so a database
 * hiccup degrades the footer to the values the site shipped with instead of
 * taking every page down.
 *
 * Reads go through one `unstable_cache` entry tagged SETTINGS_CACHE_TAG — the
 * footer renders on every page, so this must not be a query per request. The
 * admin save calls `revalidateTag`, which is what makes an edit visible
 * immediately.
 *
 * ⚠️ Never import from a Client Component — it reaches the database.
 * ⚠️ `contactEmail` is the address SHOWN to customers. The Resend sender and
 *    the order-notification recipient stay in environment variables and are
 *    deliberately untouched by this module.
 */
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SITE, WORKING_HOURS } from "@/lib/constants";
import {
  WEEKDAYS,
  type RestaurantHours,
  type RestaurantSettingsData,
  type RestaurantState,
  type Weekday,
  type WorkingHoursDay,
} from "@/types/settings";
import type { ForcedOpening, ManualClosure } from "@/types/store-status";

/** Invalidated by the admin settings save. */
export const SETTINGS_CACHE_TAG = "restaurant-settings";

/** Upper bound on staleness if a revalidateTag call is ever missed. */
const SETTINGS_REVALIDATE_SECONDS = 300;

/** The one and only settings row. */
export const SETTINGS_ROW_ID = "restaurant";

type SettingsRow = Prisma.RestaurantSettingsGetPayload<Record<string, never>>;

/**
 * The values the site shipped with, derived from lib/constants.ts. Used when
 * the row is missing (fresh database) or a read fails — never written back.
 */
export function fallbackSettings(): RestaurantSettingsData {
  // WORKING_HOURS is the grouped legacy shape ("Пн–Сб", "Нд"); expand it into
  // the per-day structure the app now uses.
  const parse = (value: string | null): { from: string | null; to: string | null } => {
    if (!value) return { from: null, to: null };
    const [from, to] = value.split("–").map((s) => s.trim());
    return { from: from || null, to: to || null };
  };

  const mondayToSaturday = WORKING_HOURS.find((w) => w.dayKey === "mondayToSaturday");
  const sunday = WORKING_HOURS.find((w) => w.dayKey === "sunday");
  const weekday = parse(mondayToSaturday?.hours ?? null);
  const weekend = parse(sunday?.hours ?? null);

  const day = (
    source: { closed: boolean } | undefined,
    times: { from: string | null; to: string | null }
  ): WorkingHoursDay => ({
    open: source ? !source.closed : false,
    from: source && !source.closed ? times.from : null,
    to: source && !source.closed ? times.to : null,
  });

  const hours = Object.fromEntries(
    WEEKDAYS.map((d) => [
      d,
      d === "sunday" ? day(sunday, weekend) : day(mondayToSaturday, weekday),
    ])
  ) as RestaurantHours;

  return {
    addressBg: SITE.address,
    addressEn: SITE.addressEn,
    primaryPhone: SITE.phones[0] ?? SITE.phone,
    secondaryPhone: SITE.phones[1] ?? "",
    contactEmail: SITE.email,
    hours,
  };
}

/** Prisma row → the plain domain shape. */
function mapSettings(row: SettingsRow): RestaurantSettingsData {
  const day = (key: Weekday): WorkingHoursDay => {
    const open = row[`${key}Open` as const] as boolean;
    const from = row[`${key}From` as const] as string | null;
    const to = row[`${key}To` as const] as string | null;
    // A day is only usable as "open" when it actually carries both bounds;
    // a half-filled legacy row degrades to closed rather than rendering
    // "11:00 – null".
    return open && from && to ? { open: true, from, to } : { open: false, from: null, to: null };
  };

  return {
    addressBg: row.addressBg,
    addressEn: row.addressEn,
    primaryPhone: row.primaryPhone,
    secondaryPhone: row.secondaryPhone ?? "",
    contactEmail: row.contactEmail,
    hours: Object.fromEntries(WEEKDAYS.map((d) => [d, day(d)])) as RestaurantHours,
  };
}

/** The "nothing is closed" closure — used for a missing row and on read errors. */
function openClosure(): ManualClosure {
  return { active: false, until: null, closedAt: null, closedByEmail: null };
}

/** The "nothing is forced" opening — the normal state: the hours decide. */
function noForcedOpening(): ForcedOpening {
  return { active: false, until: null, openedAt: null, openedByEmail: null };
}

/**
 * Prisma row → the closure snapshot.
 *
 * Instants become ISO strings here because this value crosses
 * `unstable_cache`, a JSON route and the server→client boundary, none of which
 * preserves a `Date`.
 */
function mapClosure(row: SettingsRow): ManualClosure {
  return {
    active: row.manuallyClosed,
    until: row.closedUntil ? row.closedUntil.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closedByEmail: row.closedByEmail,
  };
}

/** Prisma row → the forced-opening snapshot. Same ISO rule as the closure. */
function mapForcedOpening(row: SettingsRow): ForcedOpening {
  return {
    active: row.manuallyOpen,
    until: row.openUntil ? row.openUntil.toISOString() : null,
    openedAt: row.openedAt ? row.openedAt.toISOString() : null,
    openedByEmail: row.openedByEmail,
  };
}

const loadState = unstable_cache(
  async (): Promise<RestaurantState> => {
    const row = await db.restaurantSettings.findUnique({ where: { id: SETTINGS_ROW_ID } });
    // Deliberately does NOT create the row: a GET stays read-only. The
    // migration seeds it; this is only the safety net.
    return row
      ? {
          settings: mapSettings(row),
          closure: mapClosure(row),
          forcedOpening: mapForcedOpening(row),
        }
      : {
          settings: fallbackSettings(),
          closure: openClosure(),
          forcedOpening: noForcedOpening(),
        };
  },
  ["restaurant-state"],
  { tags: [SETTINGS_CACHE_TAG], revalidate: SETTINGS_REVALIDATE_SECONDS }
);

/**
 * Settings and closure in one read. Never throws: a database failure logs and
 * falls back to the shipped constants with the shop OPEN — a database hiccup
 * must not silently stop the restaurant from taking orders.
 */
export async function getRestaurantState(): Promise<RestaurantState> {
  try {
    return await loadState();
  } catch (error) {
    console.error("[settings] read failed, using constants fallback:", error);
    return {
      settings: fallbackSettings(),
      closure: openClosure(),
      forcedOpening: noForcedOpening(),
    };
  }
}

/**
 * The current settings. Never throws: a database failure logs and falls back
 * to the shipped constants, so the public site keeps rendering.
 */
export async function getRestaurantSettings(): Promise<RestaurantSettingsData> {
  return (await getRestaurantState()).settings;
}

/** Address in the reader's language (Bulgarian is the fallback). */
export function settingsAddress(settings: RestaurantSettingsData, locale: string): string {
  return locale === "en" ? settings.addressEn || settings.addressBg : settings.addressBg;
}

/** The published phone numbers, in order, without the empty second slot. */
export function settingsPhones(settings: RestaurantSettingsData): string[] {
  return [settings.primaryPhone, settings.secondaryPhone].filter(
    (p): p is string => Boolean(p && p.trim())
  );
}

/** The settings half of the row, as database columns. */
function settingsColumns(
  data: RestaurantSettingsData
): Prisma.RestaurantSettingsUncheckedCreateInput {
  const dayColumns = Object.fromEntries(
    WEEKDAYS.flatMap((d) => [
      [`${d}Open`, data.hours[d].open],
      [`${d}From`, data.hours[d].open ? data.hours[d].from : null],
      [`${d}To`, data.hours[d].open ? data.hours[d].to : null],
    ])
  );

  return {
    addressBg: data.addressBg,
    addressEn: data.addressEn,
    primaryPhone: data.primaryPhone,
    secondaryPhone: data.secondaryPhone.trim() || null,
    contactEmail: data.contactEmail,
    ...dayColumns,
  } as Prisma.RestaurantSettingsUncheckedCreateInput;
}

/**
 * Writes the canonical row (create-or-update in one statement, so a missing
 * row recovers instead of erroring). Callers must validate first — see
 * `lib/validators/settings.ts`.
 *
 * The closure columns are deliberately absent from the update: saving the
 * contact form must never reopen a shop that staff had just closed.
 */
export async function updateRestaurantSettings(
  data: RestaurantSettingsData
): Promise<void> {
  const values = settingsColumns(data);

  await db.restaurantSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { ...values, id: SETTINGS_ROW_ID },
    update: values,
  });
}

/** The override half of the row (both directions), as database columns. */
type OverrideColumns = Pick<
  Prisma.RestaurantSettingsUncheckedCreateInput,
  | "manuallyClosed"
  | "closedUntil"
  | "closedAt"
  | "closedByEmail"
  | "manuallyOpen"
  | "openUntil"
  | "openedAt"
  | "openedByEmail"
>;

/** No closure, as columns. */
const CLEARED_CLOSURE = {
  manuallyClosed: false,
  closedUntil: null,
  closedAt: null,
  closedByEmail: null,
} satisfies Partial<OverrideColumns>;

/** No forced opening, as columns. */
const CLEARED_FORCED_OPENING = {
  manuallyOpen: false,
  openUntil: null,
  openedAt: null,
  openedByEmail: null,
} satisfies Partial<OverrideColumns>;

/**
 * Writes only the override columns, creating the row from the shipped
 * constants if it is somehow missing — closing the shop must work even on a
 * database that never got its settings row.
 *
 * Every caller passes BOTH halves, which is how the two overrides stay
 * mutually exclusive: there is no way to set one without stating the other.
 */
async function writeOverrides(overrides: OverrideColumns): Promise<void> {
  await db.restaurantSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { ...settingsColumns(fallbackSettings()), ...overrides, id: SETTINGS_ROW_ID },
    update: overrides,
  });
}

/**
 * Closes the restaurant. `until: null` means "until someone reopens by hand";
 * a timestamp means it reopens on its own once that moment passes.
 *
 * Also cancels any forced opening: pressing "затвори" must not leave an
 * override behind that quietly reopens the shop.
 */
export async function setManualClosure(input: {
  until: Date | null;
  byEmail: string | null;
}): Promise<void> {
  await writeOverrides({
    manuallyClosed: true,
    closedUntil: input.until,
    closedAt: new Date(),
    closedByEmail: input.byEmail,
    ...CLEARED_FORCED_OPENING,
  });
}

/** Reopens the restaurant, clearing every trace of the previous closure. */
export async function clearManualClosure(): Promise<void> {
  await writeOverrides({ ...CLEARED_CLOSURE, ...CLEARED_FORCED_OPENING });
}

/**
 * Forces the restaurant open outside its opening hours. `until: null` means
 * "until someone presses stop"; a timestamp lapses on its own.
 *
 * Also clears any closure — otherwise the closure would win and the button
 * would appear to do nothing.
 */
export async function setForcedOpening(input: {
  until: Date | null;
  byEmail: string | null;
}): Promise<void> {
  await writeOverrides({
    ...CLEARED_CLOSURE,
    manuallyOpen: true,
    openUntil: input.until,
    openedAt: new Date(),
    openedByEmail: input.byEmail,
  });
}

/** Back to normal: the opening hours alone decide again. */
export async function clearForcedOpening(): Promise<void> {
  await writeOverrides({ ...CLEARED_CLOSURE, ...CLEARED_FORCED_OPENING });
}
