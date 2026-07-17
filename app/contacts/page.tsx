import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { Card } from "@/components/ui/Card";
import { SITE, WORKING_HOURS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Контакти",
  description: `Свържете се с Pizza Pazzo — ${SITE.address}, тел. ${SITE.phone}.`,
};

const mapsQuery = encodeURIComponent(`${SITE.name}, ${SITE.address}`);

export default function ContactsPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Насреща сме"
          title="Контакти"
          subtitle="Обадете се, пишете ни или минете да ни видите."
        />

        <div className="container pb-24 pt-12">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Phones */}
            <Card className="rounded-3xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pizza-green-light text-2xl">
                📞
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-pizza-ink">
                Телефони
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
                Адрес и имейл
              </h2>
              <p className="mt-3 text-sm text-pizza-muted">{SITE.address}</p>
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
                Отвори в Google Maps →
              </a>
            </Card>

            {/* Hours */}
            <Card className="rounded-3xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pizza-cream text-2xl">
                🕒
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-pizza-ink">
                Работно време
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {WORKING_HOURS.map((row) => (
                  <li key={row.days} className="flex justify-between gap-4">
                    <span className="text-pizza-muted">{row.days}</span>
                    <span
                      className={
                        row.hours === "Затворено"
                          ? "font-medium text-brand"
                          : "font-medium text-pizza-ink"
                      }
                    >
                      {row.hours}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Map */}
          <div className="mt-10 overflow-hidden rounded-3xl border border-pizza-cream-dark shadow-card">
            <iframe
              title={`Карта — ${SITE.name}`}
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
              Разгледай менюто
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
