import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductDetails } from "@/components/menu/ProductDetails";
import { findProduct, getCategoryById, getExtrasForProduct } from "@/lib/menu-data";
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

  const product = await findProduct(id, locale);
  if (!product) notFound();

  const category = await getCategoryById(product.categoryId, locale);
  // The extras offer (crusts/addons/sauces) for this product's category — null
  // for drinks/desserts, which render no picker at all.
  const extras = await getExtrasForProduct(product.categoryId);

  return (
    <>
      <Header />
      <main className="container py-10 sm:py-14">
        <ProductDetails product={product} category={category} extras={extras} />
      </main>
      <Footer />
    </>
  );
}
