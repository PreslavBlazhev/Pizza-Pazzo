import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductGrid } from "@/components/menu/ProductGrid";
import { getCategoryBySlug, getProductsByCategory } from "@/lib/menu-data";
import { type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ category: string; locale: Locale }>;
}

// Rendered on demand: the menu lives in the DB, unavailable at build time on
// Render. The data layer is cached and tag-invalidated (lib/menu-data.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug, locale } = await params;
  const category = await getCategoryBySlug(slug, locale);
  const t = await getTranslations({ locale, namespace: "menu" });
  return {
    title: category ? category.name : t("categoryFallback"),
    description: category?.description,
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category: slug, locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "menu" });
  const category = await getCategoryBySlug(slug, locale);
  if (!category) notFound();

  const products = await getProductsByCategory(category.id, locale);

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
