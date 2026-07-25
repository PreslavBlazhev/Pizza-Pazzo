/**
 * JSON-LD structured data (schema.org) for the restaurant.
 *
 * Only facts that exist in lib/constants.ts go in here — nothing invented.
 * Deliberately omitted until real data exists: aggregateRating/review (the
 * current reviews are sample data and must never reach Google as real ones),
 * sameAs (no social URLs on file).
 */
import { SITE, SITE_URL, WORKING_HOURS } from "@/lib/constants";
import type { Locale } from "@/i18n/routing";

/** schema.org DayOfWeek values for each WORKING_HOURS row. */
const DAYS_FOR_KEY: Record<(typeof WORKING_HOURS)[number]["dayKey"], string[]> = {
  mondayToSaturday: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  sunday: ["Sunday"],
};

/** Maps WORKING_HOURS ("11:00 – 22:30") to OpeningHoursSpecification entries. */
function openingHoursSpecification() {
  return WORKING_HOURS.filter((w) => !w.closed && w.hours).map((w) => {
    const [opens, closes] = (w.hours as string).split("–").map((s) => s.trim());
    return {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAYS_FOR_KEY[w.dayKey],
      opens,
      closes,
    };
  });
}

/** Restaurant schema for the given locale (URLs and cuisine names vary). */
export function getRestaurantJsonLd(locale: Locale) {
  const homeUrl = locale === "en" ? `${SITE_URL}/en` : SITE_URL;
  const menuUrl = locale === "en" ? `${SITE_URL}/en/menu` : `${SITE_URL}/menu`;

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: SITE.name,
    url: homeUrl,
    telephone: SITE.phone,
    email: SITE.email,
    image: `${SITE_URL}/logos/pizza-pazzo-logo.png`,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.streetAddress,
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
    openingHoursSpecification: openingHoursSpecification(),
  };
}
