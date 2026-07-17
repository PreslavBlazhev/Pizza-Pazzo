import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CategoryTabs } from "@/components/menu/CategoryTabs";
import { ProductGrid } from "@/components/menu/ProductGrid";
import { getCategories, getProducts } from "@/lib/menu-data";

export const metadata: Metadata = {
  title: "Дигитално меню",
  description:
    "Изберете от нашите пици, бургери, предястия, салати и десерти. Цените са в лева и евро.",
};

export default function MenuPage() {
  const categories = getCategories();
  const products = getProducts();

  // Only show categories that actually have products.
  const usedCategories = categories.filter((c) =>
    products.some((p) => p.categoryId === c.id)
  );

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-pizza-cream">
          <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-pizza-red-light blur-3xl" />
          <div className="container relative py-14 text-center sm:py-16">
            <span className="inline-block rounded-full border border-pizza-green/30 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-pizza-green">
              🍕 Pizza Pazzo
            </span>
            <h1 className="mt-4 text-4xl font-bold text-pizza-ink sm:text-5xl">
              Дигитално меню
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-pizza-muted">
              Изберете от нашите пици, бургери, предястия, салати и десерти.
            </p>
            <p className="mt-2 text-sm text-pizza-muted/80">
              Цените са посочени в лева и евро.
            </p>
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
