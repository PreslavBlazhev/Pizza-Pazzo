import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import categoriesJson from "@/data/categories.json";
import menuJson from "@/data/pizza-pazzo-menu.json";
import { routing } from "@/i18n/routing";

/**
 * Sitemap for both languages.
 *
 * Each entry declares its `alternates.languages`, which is how Google learns
 * that /menu and /en/menu are the same page in two languages rather than
 * duplicates competing for the same query.
 *
 * Only public pages belong here: /profile, /checkout, /admin and /auth are
 * either private or noindex, and listing them would just invite crawls that
 * bounce off the middleware.
 */

/**
 * Builds an absolute URL, honouring the "Bulgarian has no prefix" rule.
 *
 * The root needs its trailing slash back: for `/` in the default locale both
 * the prefix and the path collapse to "", which would emit a bare origin.
 */
function url(path: string, locale: string): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const suffix = path === "/" ? "" : path;
  const full = `${SITE_URL}${prefix}${suffix}`;
  return full === SITE_URL ? `${SITE_URL}/` : full;
}

function entry(path: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: url(path, routing.defaultLocale),
    lastModified: new Date(),
    priority,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, url(path, locale)])
      ),
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths: [string, number][] = [
    ["/", 1],
    ["/menu", 0.9],
    ["/popular", 0.7],
    ["/gallery", 0.6],
    ["/reviews", 0.6],
    ["/contacts", 0.7],
  ];

  // Slugs come from the JSON SEED, not the DB: the sitemap is prerendered at
  // build time, when the Render disk (and with it the DB) is not mounted.
  // That is safe because slugs are deliberately immutable in the admin MVP —
  // for URLs the seed and the DB are the same set.
  const categorySlugs = (categoriesJson as { slug: string; isActive: boolean }[])
    .filter((c) => c.isActive)
    .map((c) => c.slug);
  const productSlugs = (menuJson as { slug: string }[]).map((p) => p.slug);

  return [
    ...staticPaths.map(([path, priority]) => entry(path, priority)),
    ...categorySlugs.map((slug) => entry(`/menu/${slug}`, 0.8)),
    ...productSlugs.map((slug) => entry(`/product/${slug}`, 0.5)),
  ];
}
