import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { averageRating, reviews } from "@/components/reviews/reviews-data";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.reviews" });
  return { title: t("title"), description: t("description") };
}

export default function ReviewsPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("reviews");
  const avg = averageRating();

  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={
            reviews.length > 0
              ? t("subtitleAverage", { avg: avg.toFixed(1) })
              : undefined
          }
          note={reviews.length > 0 ? t("note") : undefined}
        />

        <div className="container pb-24 pt-12">
          {reviews.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-pizza-muted">{t("empty")}</p>
          )}

          <div className="mt-14 text-center">
            <Link
              href="/contacts"
              className="inline-block rounded-full border border-pizza-green px-8 py-3.5 font-semibold text-pizza-green transition hover:bg-pizza-green hover:text-white"
            >
              {t("contactUs")}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
