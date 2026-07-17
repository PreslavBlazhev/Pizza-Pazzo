import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "errors.unauthorized" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default function UnauthorizedPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("errors.unauthorized");

  return (
    <>
      <Header />
      <main className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pizza-red-light text-4xl">
          🔒
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-md text-pizza-muted">{t("subtitle")}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/profile"
            className="rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
          >
            {t("toProfile")}
          </Link>
          <Link
            href="/"
            className="rounded-full border border-pizza-green bg-white px-8 py-3.5 font-semibold text-pizza-green transition hover:bg-pizza-green hover:text-white"
          >
            {t("home")}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
