import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ n?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "orderSuccess" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

// Reads ?n= from the request — dynamic.
export const dynamic = "force-dynamic";

export default async function OrderSuccessPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { n } = await searchParams;
  const orderNumber = n && /^\d+$/.test(n) ? n : null;
  const t = await getTranslations("orderSuccess");

  return (
    <>
      <Header />
      <main className="container flex flex-col items-center py-20 text-center sm:py-28">
        <div className="text-5xl">🍕</div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        {orderNumber && (
          <p className="mt-4 rounded-full bg-pizza-green-light px-5 py-2 font-semibold text-pizza-green-dark">
            {t("orderNumber", { number: orderNumber })}
          </p>
        )}
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
