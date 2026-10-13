import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CategoryTabs } from "@/components/menu/CategoryTabs";
import { ProductGrid } from "@/components/menu/ProductGrid";
import { PromoBannersRow } from "@/components/home/PromoBanners";
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

  const t = await getTranslations({ locale, namespace: "meta.menu" });
  // Add-on categories are already left out here (lib/menu-data.ts): toppings
  // are chosen on the pizza or burger they belong to, never on their own.
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
        {/* The page opens on the two promo boards — the SAME components as on
            the homepage, so the offers can never drift apart — with the
            category bar directly underneath. The old intro block (badge,
            title, description, price note) was removed on the owner's
            request, 2026-10-13; the h1 stays for screen readers and SEO. */}
        <h1 className="sr-only">{t("title")}</h1>
        <div className="container pt-6 sm:pt-8">
          <PromoBannersRow placement="menu" />
        </div>

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
