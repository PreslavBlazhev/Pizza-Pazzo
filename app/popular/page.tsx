import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { ProductCard } from "@/components/menu/ProductCard";
import { getPopularProducts } from "@/lib/menu-data";

export const metadata: Metadata = {
  title: "Най-поръчвани",
  description: "Ястията, които гостите на Pizza Pazzo обичат най-много.",
};

export default function PopularPage() {
  const popular = getPopularProducts();

  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Любимци на гостите"
          title="Най-поръчвани"
          subtitle="Ястията, които нашите гости обичат най-много."
        />

        <div className="container pb-24 pt-12">
          {popular.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {popular.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-pizza-muted">
              Скоро ще отбележим любимите ястия на гостите.
            </p>
          )}

          <div className="mt-14 text-center">
            <Link
              href="/menu"
              className="inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              Виж цялото меню
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
