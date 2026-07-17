import Link from "next/link";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { galleryItems } from "@/components/gallery/gallery-data";

/**
 * Homepage teaser for the gallery. The full set lives on /gallery — drop the
 * real food photos into /public/images/gallery and update data/gallery.json.
 */
export function GallerySection() {
  if (galleryItems.length === 0) return null;

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="container">
        <SectionHeading
          center
          eyebrow="Апетитно"
          title="Галерия"
          subtitle="Момент от кухнята на Pizza Pazzo — вкус, който се вижда."
        />
        <div className="mt-10">
          <GalleryGrid items={galleryItems.slice(0, 5)} />
        </div>
        <div className="mt-10 text-center">
          <Link
            href="/gallery"
            className="inline-block rounded-full border border-pizza-ink/15 px-8 py-3 font-semibold text-pizza-ink transition hover:border-brand hover:text-brand"
          >
            Виж цялата галерия
          </Link>
        </div>
      </div>
    </section>
  );
}
