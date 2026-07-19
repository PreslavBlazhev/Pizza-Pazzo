import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { ProductCard } from "@/components/menu/ProductCard";
import { getPopularProducts } from "@/lib/menu-data";
import { type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

// Rendered on demand: the menu lives in the DB, unavailable at build time on
// Render. The data layer is cached and tag-invalidated (lib/menu-data.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.popular" });
  return { title: t("title"), description: t("description") };
}

export default async function PopularPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "popular" });
  const popular = await getPopularProducts(locale);

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
          {popular.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {popular.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-pizza-muted">{t("empty")}</p>
          )}

          <div className="mt-14 text-center">
            <Link
              href="/menu"
              className="inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              {t("viewFullMenu")}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
