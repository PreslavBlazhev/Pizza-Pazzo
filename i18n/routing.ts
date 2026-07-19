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
  // NO automatic locale detection (client decision 2026-07-18): with detection
  // on, any browser whose Accept-Language is English got 307-redirected from
  // `/` to `/en` — the site "loaded in English". The restaurant is Bulgarian:
  // the bare URLs ALWAYS serve Bulgarian, and English is an explicit choice
  // via the switcher (which navigates to /en/...). URLs alone carry the
  // locale; no cookie redirects.
  localeDetection: false,
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
