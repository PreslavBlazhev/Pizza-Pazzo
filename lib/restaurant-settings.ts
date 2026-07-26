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
  type Weekday,
  type WorkingHoursDay,
} from "@/types/settings";

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

const loadSettings = unstable_cache(
  async (): Promise<RestaurantSettingsData> => {
    const row = await db.restaurantSettings.findUnique({ where: { id: SETTINGS_ROW_ID } });
    // Deliberately does NOT create the row: a GET stays read-only. The
    // migration seeds it; this is only the safety net.
    return row ? mapSettings(row) : fallbackSettings();
  },
  ["restaurant-settings"],
  { tags: [SETTINGS_CACHE_TAG], revalidate: SETTINGS_REVALIDATE_SECONDS }
);

/**
 * The current settings. Never throws: a database failure logs and falls back
 * to the shipped constants, so the public site keeps rendering.
 */
export async function getRestaurantSettings(): Promise<RestaurantSettingsData> {
  try {
    return await loadSettings();
  } catch (error) {
    console.error("[settings] read failed, using constants fallback:", error);
    return fallbackSettings();
  }
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

/**
 * Writes the canonical row (create-or-update in one statement, so a missing
 * row recovers instead of erroring). Callers must validate first — see
 * `lib/validators/settings.ts`.
 */
export async function updateRestaurantSettings(
  data: RestaurantSettingsData
): Promise<void> {
  const dayColumns = Object.fromEntries(
    WEEKDAYS.flatMap((d) => [
      [`${d}Open`, data.hours[d].open],
      [`${d}From`, data.hours[d].open ? data.hours[d].from : null],
      [`${d}To`, data.hours[d].open ? data.hours[d].to : null],
    ])
  );

  const values = {
    addressBg: data.addressBg,
    addressEn: data.addressEn,
    primaryPhone: data.primaryPhone,
    secondaryPhone: data.secondaryPhone.trim() || null,
    contactEmail: data.contactEmail,
    ...dayColumns,
  } as Prisma.RestaurantSettingsUncheckedCreateInput;

  await db.restaurantSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { ...values, id: SETTINGS_ROW_ID },
    update: values,
  });
}
