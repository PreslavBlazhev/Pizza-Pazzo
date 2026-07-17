import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductGrid } from "@/components/menu/ProductGrid";
import { getCategoryBySlug, getProductsByCategory } from "@/lib/menu-data";

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  return { title: category ? category.name : "Категория" };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const products = getProductsByCategory(category.id);

  return (
    <>
      <Header />
      <main className="container py-10 sm:py-14">
        <Link
          href="/menu"
          className="inline-flex items-center gap-1 text-sm font-medium text-pizza-muted transition hover:text-brand"
        >
          ← Всички категории
        </Link>
        <div className="mt-8">
          <ProductGrid categories={[category]} products={products} />
        </div>
      </main>
      <Footer />
    </>
  );
}
