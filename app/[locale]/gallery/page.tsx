import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { getGalleryItems } from "@/lib/gallery-data";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

// The photos live in the database (Admin → Галерия), which on Render is not
// available at build time — render on demand; lib/gallery-data.ts caches the
// read and every admin save invalidates it.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.gallery" });
  return { title: t("title"), description: t("description") };
}

export default async function GalleryPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "gallery" });
  const tCommon = await getTranslations({ locale, namespace: "common" });
  const galleryItems = await getGalleryItems(locale);

  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          note={
            galleryItems.some((item) => item.src.startsWith("/images/products/placeholder"))
              ? t("note")
              : undefined
          }
        />

        <div className="container pb-24 pt-12">
          {galleryItems.length > 0 ? (
            <GalleryGrid items={galleryItems} />
          ) : (
            <p className="py-16 text-center text-pizza-muted">{t("empty")}</p>
          )}

          <div className="mt-14 text-center">
            <Link
              href="/menu"
              className="inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              {tCommon("browseMenu")}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
