import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductDetails } from "@/components/menu/ProductDetails";
import { findProduct, getCategoryById } from "@/lib/menu-data";
import { type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ id: string; locale: Locale }>;
}

// Rendered on demand: the menu lives in the DB, unavailable at build time on
// Render. The data layer is cached and tag-invalidated (lib/menu-data.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, locale } = await params;
  const product = await findProduct(id, locale);
  const t = await getTranslations({ locale, namespace: "product" });
  return {
    title: product ? product.name : t("fallbackTitle"),
    description: product?.description || undefined,
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "product" });
  const product = await findProduct(id, locale);
  if (!product) notFound();

  const category = await getCategoryById(product.categoryId, locale);

  return (
    <>
      <Header />
      <main className="container py-10 sm:py-14">
        <Link
          href="/menu"
          className="inline-flex items-center gap-1 text-sm font-medium text-pizza-muted transition hover:text-brand"
        >
          {t("backToMenu")}
        </Link>
        <div className="mt-8">
          <ProductDetails product={product} category={category} />
        </div>
      </main>
      <Footer />
    </>
  );
}
