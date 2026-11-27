import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { HOME_GALLERY_COUNT, getGalleryItems } from "@/lib/gallery-data";
import type { Locale } from "@/i18n/routing";

/**
 * Homepage teaser for the gallery ("Из нашата кухня"): the first
 * HOME_GALLERY_COUNT photos by the order set in Admin → Галерия. The full set
 * lives on /gallery.
 */
export async function GallerySection({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "gallery" });
  const galleryItems = await getGalleryItems(locale);

  if (galleryItems.length === 0) return null;

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="container">
        <SectionHeading
          center
          eyebrow={t("eyebrow")}
          title={t("homeTitle")}
          subtitle={t("homeSubtitle")}
        />
        <div className="mt-10">
          <GalleryGrid items={galleryItems.slice(0, HOME_GALLERY_COUNT)} />
        </div>
        <div className="mt-10 text-center">
          <Link
            href="/gallery"
            className="inline-block rounded-full border border-pizza-ink/15 px-8 py-3 font-semibold text-pizza-ink transition hover:border-brand hover:text-brand"
          >
            {t("viewAll")}
          </Link>
        </div>
      </div>
    </section>
  );
}
