import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CategoryTabs } from "@/components/menu/CategoryTabs";
import { ProductGrid } from "@/components/menu/ProductGrid";
import { getCategories, getProducts } from "@/lib/menu-data";
import { type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

// The menu lives in the database, which on Render is not available at build
// time — so this page renders on demand; the data layer itself is cached and
// tag-invalidated on admin edits (see lib/menu-data.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.menu" });
  return { title: t("title"), description: t("description") };
}

export default async function MenuPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "menu.hero" });
  const categories = await getCategories(locale);
  const products = await getProducts(locale);

  // Only show categories that actually have products.
  const usedCategories = categories.filter((c) =>
    products.some((p) => p.categoryId === c.id)
  );

  return (
    <>
      <Header />
      <main>
        {/* Hero — deliberately no background of its own: the body's cream +
            food-doodle pattern shows through (client request, 2026-07). */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-pizza-red-light blur-3xl" />
          <div className="container relative py-14 text-center sm:py-16">
            <span className="inline-block rounded-full border border-pizza-green/30 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-pizza-green">
              🍕 Pizza Pazzo
            </span>
            <h1 className="mt-4 text-4xl font-bold text-pizza-ink sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-pizza-muted">
              {t("subtitle")}
            </p>
            <p className="mt-2 text-sm text-pizza-muted/80">{t("priceNote")}</p>
          </div>
        </section>

        {/* Category navigation + products */}
        <div className="container pb-24">
          <CategoryTabs categories={usedCategories} />
          <div className="mt-12">
            <ProductGrid categories={usedCategories} products={products} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
