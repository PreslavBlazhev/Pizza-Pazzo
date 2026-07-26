/**
 * JSON-LD structured data (schema.org) for the restaurant.
 *
 * Contact details and opening hours come from the admin-editable settings row
 * (lib/restaurant-settings.ts); only facts that genuinely exist are emitted —
 * nothing is invented. Deliberately omitted until real data exists:
 * aggregateRating/review (the current reviews are sample data and must never
 * reach Google as real ones), sameAs (no social URLs on file), geo coordinates.
 */
import { SITE, SITE_URL } from "@/lib/constants";
import {
  getRestaurantSettings,
  settingsAddress,
} from "@/lib/restaurant-settings";
import { toOpeningHoursSpecification } from "@/lib/working-hours";
import type { Locale } from "@/i18n/routing";

/** Restaurant schema for the given locale (URLs and cuisine names vary). */
export async function getRestaurantJsonLd(locale: Locale) {
  const homeUrl = locale === "en" ? `${SITE_URL}/en` : SITE_URL;
  const menuUrl = locale === "en" ? `${SITE_URL}/en/menu` : `${SITE_URL}/menu`;
  const settings = await getRestaurantSettings();

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: SITE.name,
    url: homeUrl,
    telephone: settings.primaryPhone,
    email: settings.contactEmail,
    image: `${SITE_URL}/logos/pizza-pazzo-logo.png`,
    address: {
      "@type": "PostalAddress",
      // The admin edits one display address; it already carries the town, so
      // it doubles as streetAddress while addressLocality stays explicit for
      // consumers that read the fields separately.
      streetAddress: settingsAddress(settings, locale),
      addressLocality: locale === "en" ? SITE.cityEn : SITE.city,
      addressCountry: "BG",
    },
    servesCuisine:
      locale === "en"
        ? ["Pizza", "Italian", "Burgers"]
        : ["Пица", "Италианска кухня", "Бургери"],
    priceRange: "€€",
    foundingDate: String(SITE.foundedYear),
    menu: menuUrl,
    // Closed days are simply absent — never emitted with empty opens/closes.
    openingHoursSpecification: toOpeningHoursSpecification(settings.hours),
  };
}
