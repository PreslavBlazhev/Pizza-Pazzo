import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TrackingView } from "@/components/tracking/TrackingView";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tracking" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
    // The e-mail link carries its token in the URL fragment; this keeps any
    // link clicked from here from announcing even the page's address.
    referrer: "no-referrer",
  };
}

// Personal and short-lived: never prerendered, never cached.
export const dynamic = "force-dynamic";

/**
 * /track — the customer's order tracking. Everything is fetched by the
 * client from /api/track (no-store) so the server-rendered HTML holds no
 * order at all and nothing order-related lands in a page cache.
 */
export default async function TrackPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tracking");
  return (
    <>
      <Header />
      <main className="container max-w-xl py-12 sm:py-16">
        <h1 className="font-display text-3xl font-bold text-pizza-ink sm:text-4xl">{t("title")}</h1>
        <p className="mb-6 mt-3 text-pizza-muted">{t("intro")}</p>
        <TrackingView />
      </main>
      <Footer />
    </>
  );
}
