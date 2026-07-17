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
  const t = await getTranslations({ locale, namespace: "orderSuccess" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Confirmation page. Wired up to real orders in Stage 4. */
export default function OrderSuccessPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("orderSuccess");

  return (
    <>
      <Header />
      <main className="container flex flex-col items-center py-20 text-center sm:py-28">
        <div className="text-5xl">🍕</div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-lg leading-relaxed text-pizza-muted">
          {t("subtitle")}
        </p>
        <Link
          href="/menu"
          className="mt-8 rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
        >
          {t("backToMenu")}
        </Link>
      </main>
      <Footer />
    </>
  );
}
