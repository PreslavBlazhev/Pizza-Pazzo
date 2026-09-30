import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo/alternates";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { Card } from "@/components/ui/Card";
import { SITE } from "@/lib/constants";
import { companyFor } from "@/content/legal/company";
import { ClickToLoadMap } from "@/components/contacts/ClickToLoadMap";
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
    alternates: pageAlternates("/contacts", locale),
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
  const tLegal = await getTranslations("legal");
  const company = companyFor(locale);

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
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-pizza-muted">
                {t("restaurantAddress")}
              </p>
              <p className="mt-1 text-sm text-pizza-muted">{address}</p>
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
                      {row.closed ? tHours("closed") : row.allDay ? tHours("allDay") : row.hours}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Merchant + complaints — the seller's identity and the channel
              for cancellations, complaints and refunds (UBB-02, UBB-04). */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="rounded-3xl" id="merchant">
              <h2 className="font-display text-xl font-semibold text-pizza-ink">
                {t("merchantTitle")}
              </h2>
              <p className="mt-3 font-semibold text-pizza-ink">{company.legalName}</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm text-pizza-muted sm:grid-cols-[auto_1fr]">
                <dt className="font-medium text-pizza-ink">{tLegal("uic")}</dt>
                <dd>{company.uic}</dd>
                <dt className="font-medium text-pizza-ink">{tLegal("vatNumber")}</dt>
                <dd>{company.vatNumber}</dd>
                <dt className="font-medium text-pizza-ink">{tLegal("registeredAddress")}</dt>
                <dd>{company.registeredAddress}</dd>
                <dt className="font-medium text-pizza-ink">{tLegal("correspondenceAddress")}</dt>
                <dd>{company.correspondenceAddress}</dd>
                {company.foodRegistration && (
                  <>
                    <dt className="font-medium text-pizza-ink">{tLegal("foodRegistration")}</dt>
                    <dd>
                      {tLegal("foodRegistrationValue", {
                        number: company.foodRegistration.number,
                        certificate: company.foodRegistration.certificate,
                        authority: company.foodRegistration.authority,
                      })}
                    </dd>
                  </>
                )}
              </dl>
            </Card>
            <Card className="rounded-3xl" id="complaints">
              <h2 className="font-display text-xl font-semibold text-pizza-ink">
                {t("complaintsTitle")}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-pizza-muted">
                {t.rich("complaintsText", {
                  link: (chunks) => (
                    <Link href="/refunds" className="font-semibold text-pizza-green underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {phones.map((p) => (
                  <li key={p}>
                    <a href={telHref(p)} className="font-medium text-pizza-ink underline transition hover:text-brand">
                      {p}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href={`mailto:${settings.contactEmail}`}
                    className="break-all font-medium text-pizza-ink underline transition hover:text-brand"
                  >
                    {settings.contactEmail}
                  </a>
                </li>
              </ul>
            </Card>
          </div>

          {/* Map — loaded from Google only on request (no third-party request
              or cookie before the click). */}
          <div className="mt-10 overflow-hidden rounded-3xl border border-pizza-cream-dark shadow-card">
            <ClickToLoadMap
              title={t("mapTitle", { name: SITE.name })}
              src={`https://www.google.com/maps?q=${mapsQuery}&output=embed`}
              buttonLabel={t("showMap")}
              notice={t.rich("mapNotice", {
                link: (chunks) => (
                  <Link href="/cookies" className="underline">
                    {chunks}
                  </Link>
                ),
              })}
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
