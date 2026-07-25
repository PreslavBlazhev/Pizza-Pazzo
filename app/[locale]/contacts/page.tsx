import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { Card } from "@/components/ui/Card";
import { getSiteAddress, SITE, WORKING_HOURS } from "@/lib/constants";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.contacts" });
  return {
    title: t("title"),
    description: t("description", {
      address: getSiteAddress(locale),
      phone: SITE.phone,
    }),
  };
}

// Street + city without the "(Срещу Технополис)" hint — cleaner Maps match.
const mapsQuery = encodeURIComponent(
  `${SITE.name}, ${SITE.city}, ${SITE.streetAddress}`
);

export default function ContactsPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("contacts");
  const tHours = useTranslations("hours");
  const tCommon = useTranslations("common");

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
                {SITE.phones.map((p) => (
                  <li key={p}>
                    <a
                      href={`tel:${p.replace(/\s/g, "")}`}
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
              <p className="mt-3 text-sm text-pizza-muted">
                {getSiteAddress(locale)}
              </p>
              <a
                href={`mailto:${SITE.email}`}
                className="mt-2 inline-block text-sm font-medium text-pizza-ink transition hover:text-brand"
              >
                {SITE.email}
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
                {WORKING_HOURS.map((row) => (
                  <li key={row.dayKey} className="flex justify-between gap-4">
                    <span className="text-pizza-muted">{tHours(row.dayKey)}</span>
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
