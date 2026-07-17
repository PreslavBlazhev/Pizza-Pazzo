import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductGrid } from "@/components/menu/ProductGrid";
import {
  getAllCategorySlugs,
  getCategoryBySlug,
  getProductsByCategory,
} from "@/lib/menu-data";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ category: string; locale: Locale }>;
}

/** Every category in every locale — the whole menu is known at build time. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getAllCategorySlugs().map((category) => ({ locale, category }))
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug, locale } = await params;
  const category = getCategoryBySlug(slug, locale);
  const t = await getTranslations({ locale, namespace: "menu" });
  return {
    title: category ? category.name : t("categoryFallback"),
    description: category?.description,
  };
}

export default function CategoryPage({ params }: PageProps) {
  const { category: slug, locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("menu");
  const category = getCategoryBySlug(slug, locale);
  if (!category) notFound();

  const products = getProductsByCategory(category.id, locale);

  return (
    <>
      <Header />
      <main className="container py-10 sm:py-14">
        <Link
          href="/menu"
          className="inline-flex items-center gap-1 text-sm font-medium text-pizza-muted transition hover:text-brand"
        >
          {t("allCategories")}
        </Link>
        <div className="mt-8">
          <ProductGrid categories={[category]} products={products} />
        </div>
      </main>
      <Footer />
    </>
  );
}
