import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { Card } from "@/components/ui/Card";
import { SITE } from "@/lib/constants";
import {
  getRestaurantSettings,
  settingsAddress,
  settingsPhones,
} from "@/lib/restaurant-settings";
import { groupWorkingHours, telHref, workingHoursRowLabel } from "@/lib/working-hours";
import type { Weekday } from "@/types/settings";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const [t, settings] = await Promise.all([
    getTranslations({ locale, namespace: "meta.contacts" }),
    getRestaurantSettings(),
  ]);
  return {
    title: t("title"),
    description: t("description", {
      address: settingsAddress(settings, locale),
      phone: settings.primaryPhone,
    }),
  };
}

export default async function ContactsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("contacts");
  const tHours = await getTranslations("hours");
  const tCommon = await getTranslations("common");

  const settings = await getRestaurantSettings();
  const address = settingsAddress(settings, locale);
  const phones = settingsPhones(settings);
  const hourRows = groupWorkingHours(settings.hours);
  const dayName = (day: Weekday) => tHours(day);
  // The admin-entered address already names the town, so it is the best Maps
  // query we have — the restaurant is what should be found, not a street.
  const mapsQuery = encodeURIComponent(`${SITE.name}, ${settings.addressBg}`);

  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="container pb-24 pt-12">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Phones */}
            <Card className="rounded-3xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pizza-green-light text-2xl">
                📞
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-pizza-ink">
                {t("phones")}
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-pizza-muted">
                {phones.map((p) => (
                  <li key={p}>
                    <a
                      href={telHref(p)}
                      className="font-medium text-pizza-ink transition hover:text-brand"
                    >
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Address + email */}
            <Card className="rounded-3xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pizza-red-light text-2xl">
                📍
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-pizza-ink">
                {t("addressAndEmail")}
              </h2>
              <p className="mt-3 text-sm text-pizza-muted">{address}</p>
              <a
                href={`mailto:${settings.contactEmail}`}
                className="mt-2 inline-block text-sm font-medium text-pizza-ink transition hover:text-brand"
              >
                {settings.contactEmail}
              </a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block text-sm font-semibold text-pizza-green transition hover:text-pizza-green-dark"
              >
                {t("openInMaps")}
              </a>
            </Card>

            {/* Hours */}
            <Card className="rounded-3xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pizza-cream text-2xl">
                🕒
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-pizza-ink">
                {tHours("title")}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {hourRows.map((row) => (
                  <li key={row.days[0]} className="flex justify-between gap-4">
                    <span className="text-pizza-muted">
                      {workingHoursRowLabel(row, dayName)}
                    </span>
                    <span
                      className={
                        row.closed
                          ? "font-medium text-brand"
                          : "font-medium text-pizza-ink"
                      }
                    >
                      {row.closed ? tHours("closed") : row.hours}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Map */}
          <div className="mt-10 overflow-hidden rounded-3xl border border-pizza-cream-dark shadow-card">
            <iframe
              title={t("mapTitle", { name: SITE.name })}
              src={`https://www.google.com/maps?q=${mapsQuery}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[380px] w-full border-0"
            />
          </div>

          <div className="mt-14 text-center">
            <Link
              href="/menu"
              className="inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              {tCommon("browseMenu")}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
