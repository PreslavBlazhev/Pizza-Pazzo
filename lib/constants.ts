/** Global constants for the Pizza Pazzo app. */
import type { UserRole } from "@/types/auth";

export const SITE = {
  name: "Pizza Pazzo",
  legalName: "Pizza Pazzo LTD",
  tagline: "Доставка на пици",
  description:
    "Доставка на автентична италианска пица — поръчайте онлайн от Pizza Pazzo.",
  foundedYear: 2012,
  /** Public contact phones (primary first). */
  phones: ["+359 88 248 4777", "+359 801 999"],
  /** Primary phone (kept for convenience). */
  phone: "+359 88 248 4777",
  email: "orderspp@gmail.com",
  address: "ул. Димитър Константинов 35",
  website: "www.pizzapazzo.bg",
} as const;

/** Working hours, grouped for display. Source: client intake. */
export const WORKING_HOURS = [
  { days: "Понеделник", hours: "11:00 – 22:30" },
  { days: "Вторник – Четвъртък", hours: "09:00 – 18:00" },
  { days: "Петък", hours: "09:00 – 19:00" },
  { days: "Събота", hours: "10:00 – 16:00" },
  { days: "Неделя", hours: "Затворено" },
] as const;

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
 */
export const ADMIN_NAV = [
  { href: "/admin", label: "Табло", allow: ["staff", "admin", "super_admin"] },
  { href: "/admin/orders", label: "Поръчки", allow: ["staff", "admin", "super_admin"] },
  { href: "/admin/menu", label: "Меню", allow: ["staff", "admin", "super_admin"] },
  { href: "/admin/products", label: "Продукти", allow: ["staff", "admin", "super_admin"] },
  { href: "/admin/categories", label: "Категории", allow: ["staff", "admin", "super_admin"] },
  { href: "/admin/users", label: "Потребители", allow: ["admin", "super_admin"] },
  { href: "/admin/settings", label: "Настройки", allow: ["admin", "super_admin"] },
] as const satisfies readonly {
  href: string;
  label: string;
  allow: readonly UserRole[];
}[];
