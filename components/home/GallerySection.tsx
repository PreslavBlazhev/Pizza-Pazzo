import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { galleryItems } from "@/components/gallery/gallery-data";

/**
 * Homepage teaser for the gallery. The full set lives on /gallery — drop the
 * real food photos into /public/images/gallery and update data/gallery.json.
 */
export function GallerySection() {
  const t = useTranslations("gallery");

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
          <GalleryGrid items={galleryItems.slice(0, 5)} />
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
