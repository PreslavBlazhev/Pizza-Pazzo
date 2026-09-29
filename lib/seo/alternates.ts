import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/**
 * Per-page canonical + hreflang, relative to metadataBase (SITE_URL).
 *
 * The [locale] layout sets the HOMEPAGE's canonical, and Next.js hands it
 * down to every child page that does not set its own — so, without this,
 * /terms declared https://pizzapazzo.bg/ as its canonical and search engines
 * were told the legal pages are duplicates of the homepage.
 */
export function pageAlternates(path: `/${string}`, locale: string): Metadata["alternates"] {
  const bg = path;
  const en = `/en${path}`;
  return {
    canonical: locale === routing.defaultLocale ? bg : en,
    languages: { bg, en, "x-default": bg },
  };
}
