import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for the site.
 *
 * `localePrefix: "as-needed"` keeps Bulgarian on the bare paths (`/menu`,
 * `/contacts`) and puts English behind `/en` (`/en/menu`). This is deliberate:
 * pizzapazzo.bg has been indexed since 2012, so the Bulgarian URLs must not
 * move. Prefixing both locales would 301 every existing URL and throw away the
 * accumulated ranking for no benefit.
 */
export const routing = defineRouting({
  locales: ["bg", "en"],
  defaultLocale: "bg",
  localePrefix: "as-needed",
  // The visitor's own choice wins over the Accept-Language header, and it is
  // remembered in a cookie. Without this, a Bulgarian browser could never stay
  // on the English site.
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && routing.locales.includes(value as Locale)
  );
}

/** Human-readable names for the language switcher (each in its own language). */
export const LOCALE_LABELS: Record<Locale, string> = {
  bg: "Български",
  en: "English",
};

/** Short labels for the compact switcher in the header. */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  bg: "BG",
  en: "EN",
};
