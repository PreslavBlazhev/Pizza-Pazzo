import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { galleryItems } from "@/components/gallery/gallery-data";

export const metadata: Metadata = {
  title: "Галерия",
  description:
    "Снимки от кухнята на Pizza Pazzo — пици на дърва, бургери, салати и десерти.",
};

export default function GalleryPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Апетитно"
          title="Галерия"
          subtitle="Момент от кухнята на Pizza Pazzo — вкус, който се вижда."
          note="Снимките ще бъдат заменени с реални от ресторанта."
        />

        <div className="container pb-24 pt-12">
          {galleryItems.length > 0 ? (
            <GalleryGrid items={galleryItems} />
          ) : (
            <p className="py-16 text-center text-pizza-muted">
              Скоро тук ще има снимки.
            </p>
          )}

          <div className="mt-14 text-center">
            <Link
              href="/menu"
              className="inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              Разгледай менюто
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
