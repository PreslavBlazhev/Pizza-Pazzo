import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductDetails } from "@/components/menu/ProductDetails";
import { findProduct, getCategoryById } from "@/lib/menu-data";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = findProduct(id);
  return { title: product ? product.name : "Продукт" };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = findProduct(id);
  if (!product) notFound();

  const category = getCategoryById(product.categoryId);

  return (
    <>
      <Header />
      <main className="container py-10 sm:py-14">
        <Link
          href="/menu"
          className="inline-flex items-center gap-1 text-sm font-medium text-pizza-muted transition hover:text-brand"
        >
          ← Назад към менюто
        </Link>
        <div className="mt-8">
          <ProductDetails product={product} category={category} />
        </div>
      </main>
      <Footer />
    </>
  );
}
