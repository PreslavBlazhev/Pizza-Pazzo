import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Where deleteOwnAccount lands after it succeeds.
 *
 * A separate page rather than a flash message on the home page: the account is
 * gone and the session with it, so there is nowhere left to show a message —
 * and someone who just deleted their account deserves a plain confirmation that
 * it worked, plus a second reminder of what was kept.
 */
interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "accountDeleted" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function AccountDeletedPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("accountDeleted");

  return (
    <>
      <Header />
      <main className="container max-w-2xl py-20 text-center sm:py-28">
        <h1 className="font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-pizza-muted">{t("body")}</p>
        <p className="mt-3 text-sm leading-relaxed text-pizza-muted">{t("orders")}</p>
        <Link
          href="/"
          className="mt-10 inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
        >
          {t("home")}
        </Link>
      </main>
      <Footer />
    </>
  );
}
