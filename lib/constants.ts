/** Global constants for the Pizza Pazzo app. */
import type { UserRole } from "@/types/auth";

/**
 * Business facts that do not change with language: name, phones, address.
 *
 * Anything a visitor reads as a sentence (taglines, descriptions, day names)
 * lives in `messages/*.json` instead — it has to exist in both languages.
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
  address: "ул. Димитър Константинов 35",
  website: "www.pizzapazzo.bg",
} as const;

/**
 * Canonical origin of the site, used to build absolute URLs for Open Graph and
 * hreflang. Override per environment with NEXT_PUBLIC_SITE_URL (Vercel previews
 * and localhost are not pizzapazzo.bg).
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pizzapazzo.bg";

/**
 * Working hours, grouped for display. Source: client intake.
 *
 * `dayKey` indexes the `hours` namespace in the message catalogues rather than
 * naming the days here, and `closed` is a flag instead of the literal string
 * "Затворено" — comparing against that string was how the old code decided to
 * paint Sunday red, which would have silently stopped working in English.
 */
export const WORKING_HOURS = [
  { dayKey: "monday", hours: "11:00 – 22:30", closed: false },
  { dayKey: "tuesdayToThursday", hours: "09:00 – 18:00", closed: false },
  { dayKey: "friday", hours: "09:00 – 19:00", closed: false },
  { dayKey: "saturday", hours: "10:00 – 16:00", closed: false },
  { dayKey: "sunday", hours: null, closed: true },
] as const satisfies readonly {
  dayKey: "monday" | "tuesdayToThursday" | "friday" | "saturday" | "sunday";
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

/** Currency labels used across the menu. */
export const CURRENCY_LABELS = {
  bgn: "лв.",
  eur: "€",
} as const;

/** Fallback image used when a product has no imageUrl or it fails to load. */
export const DEFAULT_PRODUCT_IMAGE = "/images/products/placeholder-food.svg";

/** Fixed BGN ↔ EUR rate (Bulgaria adopts the euro; kept for dual display). */
export const EUR_TO_BGN = 1.95583;

export const CURRENCY = {
  primary: "EUR",
  secondary: "BGN",
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
  { href: "/admin/menu", labelKey: "menu", allow: ["STAFF", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/products", labelKey: "products", allow: ["STAFF", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/categories", labelKey: "categories", allow: ["STAFF", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/users", labelKey: "users", allow: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/settings", labelKey: "settings", allow: ["ADMIN", "SUPER_ADMIN"] },
] as const satisfies readonly {
  href: string;
  labelKey: string;
  allow: readonly UserRole[];
}[];
