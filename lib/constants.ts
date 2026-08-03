/** Global constants for the Pizza Pazzo app. */
import type { UserRole } from "@/types/auth";

/**
 * Business facts that do not change with language: name, phones, address.
 *
 * Anything a visitor reads as a sentence (taglines, descriptions, day names)
 * lives in `messages/*.json` instead — it has to exist in both languages.
 *
 * ⚠️ CONTACT DATA IS NO LONGER READ DIRECTLY BY THE PUBLIC SITE.
 * `address`, `addressEn`, `phones`, `phone` and `email` are now only the
 * FALLBACK behind the admin-editable settings row — see
 * lib/restaurant-settings.ts, which the footer, contacts page, legal pages and
 * JSON-LD read instead. They stay here because they seeded the database and
 * because they are what renders if that read ever fails. `name`, `legalName`,
 * `foundedYear`, `website`, `city` and `streetAddress` are NOT editable and
 * remain the real source.
 */
export const SITE = {
  name: "Pizza Pazzo",
  legalName: "Pizza Pazzo LTD",
  foundedYear: 2012,
  /** Public contact phones (primary first). */
  phones: ["+359 88 248 4777", "+359 801 999"],
  /** Primary phone (kept for convenience). */
  phone: "+359 88 248 4777",
  email: "orderspp@gmail.com",
  /** Full display address (BG) as shown to visitors. Updated 2026-07. */
  address: "Плевен, ул. Георги Кочев 13 (Срещу Технополис)",
  /** Full display address for the English pages. */
  addressEn: "13 Georgi Kochev St., Pleven (opposite Technopolis)",
  /** Street only — for schema.org streetAddress and Maps queries, where the
   *  "(Срещу Технополис)" landmark hint would just add noise. */
  streetAddress: "ул. Георги Кочев 13",
  city: "Плевен",
  cityEn: "Pleven",
  website: "www.pizzapazzo.bg",
} as const;

// `getSiteAddress(locale)` used to live here. It was removed with the settings
// table: the live address comes from the database, and leaving a constants-only
// helper around invited callers to quietly bypass it. Use
// `settingsAddress(settings, locale)` from lib/restaurant-settings.ts instead.

/**
 * Canonical origin of the site, used to build absolute URLs for Open Graph and
 * hreflang. Override per environment with NEXT_PUBLIC_SITE_URL (Vercel previews
 * and localhost are not pizzapazzo.bg).
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pizzapazzo.bg";

/**
 * Working hours, grouped for display.
 *
 * ⚠️ FALLBACK ONLY — the live hours come from the settings row (per weekday,
 * admin-editable). This grouped shape seeded that row and is expanded back
 * into the per-day structure by `fallbackSettings()` when the database is
 * unavailable.
 *
 * `dayKey` indexes the `hours` namespace in the message catalogues rather than
 * naming the days here, and `closed` is a flag instead of the literal string
 * "Затворено" — comparing against that string was how the old code decided to
 * paint Sunday red, which would have silently stopped working in English.
 */
export const WORKING_HOURS = [
  { dayKey: "mondayToSaturday", hours: "11:00 – 23:00", closed: false },
  { dayKey: "sunday", hours: "11:00 – 22:30", closed: false },
] as const satisfies readonly {
  dayKey: "mondayToSaturday" | "sunday";
  hours: string | null;
  closed: boolean;
}[];

/** Brand identity — name, colours and defaults. Colours mirror the Tailwind
 *  theme (see tailwind.config.ts) and are kept here for non-CSS use. */
export const PIZZA_PAZZO_BRAND = {
  name: "Pizza Pazzo",
  colors: {
    white: "#FFFFFF",
    green: "#178A3D",
    red: "#D62828",
  },
} as const;

export const RESTAURANT_NAME = PIZZA_PAZZO_BRAND.name;

/** Currency label used across the menu — the euro is the only currency. */
export const CURRENCY_LABELS = {
  eur: "€",
} as const;

/** Fallback image used when a product has no imageUrl or it fails to load. */
export const DEFAULT_PRODUCT_IMAGE = "/images/products/placeholder-food.svg";

export const CURRENCY = {
  primary: "EUR",
} as const;

/** Default flat delivery fee in EUR (placeholder). */
export const DELIVERY_FEE = 2.5;

/** Preset ETA choices (minutes) offered to staff when accepting an order. */
export const ETA_PRESETS = [20, 30, 45, 60, 90] as const;

/**
 * Admin navigation. `allow` lists the roles that may see each link — it mirrors
 * the rules in `middleware.ts`, which is what actually enforces them.
 *
 * `labelKey` indexes the `admin.nav` namespace in the message catalogues.
 */
export const ADMIN_NAV = [
  { href: "/admin", labelKey: "dashboard", allow: ["STAFF", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/orders", labelKey: "orders", allow: ["STAFF", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/orders/live", labelKey: "liveOrders", allow: ["STAFF", "ADMIN", "SUPER_ADMIN"] },
  // Financial figures — ADMIN+ only, mirrored by the middleware rule.
  { href: "/admin/reports", labelKey: "reports", allow: ["ADMIN", "SUPER_ADMIN"] },
  // /admin/menu is gone — /admin/products IS the menu management now.
  { href: "/admin/products", labelKey: "products", allow: ["STAFF", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/categories", labelKey: "categories", allow: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/users", labelKey: "users", allow: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/settings", labelKey: "settings", allow: ["ADMIN", "SUPER_ADMIN"] },
] as const satisfies readonly {
  href: string;
  labelKey: string;
  allow: readonly UserRole[];
}[];
