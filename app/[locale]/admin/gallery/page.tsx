import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { HOME_GALLERY_COUNT } from "@/lib/gallery-data";
import { GalleryImageCard } from "@/components/admin/GalleryImageCard";

export const metadata: Metadata = { title: "Галерия" };

/**
 * Gallery management (ADMIN+): the photos in "Из нашата кухня" on the home
 * page (the first HOME_GALLERY_COUNT) and on /gallery (all of them).
 */
export default async function AdminGalleryPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const images = await db.galleryImage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, imageUrl: true, captionBg: true, captionEn: true },
  });

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">Галерия</h1>
      <p className="mb-6 mt-1.5 text-sm text-pizza-muted">
        Снимките в „Из нашата кухня“. Първите {HOME_GALLERY_COUNT} се виждат на
        началната страница (№1 е голямата), а всички — в страница „Галерия“.
        Подредбата се сменя със стрелките. Промените се публикуват веднага.
      </p>

      <div className="space-y-4">
        <GalleryImageCard homeCount={HOME_GALLERY_COUNT} />
        {images.map((image, index) => (
          <GalleryImageCard
            key={image.id}
            image={image}
            index={index}
            total={images.length}
            homeCount={HOME_GALLERY_COUNT}
          />
        ))}
        {images.length === 0 && (
          <p className="py-8 text-center text-sm text-pizza-muted">
            В галерията още няма снимки — секцията на началната страница е скрита.
          </p>
        )}
      </div>
    </div>
  );
}
