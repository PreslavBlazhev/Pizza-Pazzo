import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductDetails } from "@/components/menu/ProductDetails";
import {
  findProduct,
  getAllProductSlugs,
  getCategoryById,
} from "@/lib/menu-data";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ id: string; locale: Locale }>;
}

/** Every product in every locale — 101 products, all static. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getAllProductSlugs().map((id) => ({ locale, id }))
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, locale } = await params;
  const product = findProduct(id, locale);
  const t = await getTranslations({ locale, namespace: "product" });
  return {
    title: product ? product.name : t("fallbackTitle"),
    description: product?.description || undefined,
  };
}

export default function ProductPage({ params }: PageProps) {
  const { id, locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("product");
  const product = findProduct(id, locale);
  if (!product) notFound();

  const category = getCategoryById(product.categoryId, locale);

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
