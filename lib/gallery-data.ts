/**
 * Gallery read path — the photos live in the database (GalleryImage) and are
 * edited from Admin → Галерия. One cached read tagged GALLERY_CACHE_TAG, the
 * same pattern as lib/menu-data.ts: every admin save calls updateTag, so the
 * public pages show the change immediately.
 */
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/** Invalidated by every admin gallery edit — see app/actions/admin-gallery.ts. */
export const GALLERY_CACHE_TAG = "gallery";

/** How many tiles the home page teaser shows (the first one big). */
export const HOME_GALLERY_COUNT = 5;

/** One gallery tile, resolved for the reader's language. */
export interface GalleryItem {
  id: string;
  src: string;
  caption: string;
  alt: string;
}

interface StoredGalleryItem {
  id: string;
  imageUrl: string;
  captionBg: string;
  captionEn: string;
}

const loadGallery = unstable_cache(
  async (): Promise<StoredGalleryItem[]> =>
    db.galleryImage.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, imageUrl: true, captionBg: true, captionEn: true },
    }),
  ["gallery-data"],
  { tags: [GALLERY_CACHE_TAG], revalidate: 300 }
);

/** The gallery in one language. An empty English caption falls back to BG. */
export async function getGalleryItems(locale: string): Promise<GalleryItem[]> {
  const rows = await loadGallery();
  return rows.map((row) => {
    const caption =
      locale === "en" ? row.captionEn.trim() || row.captionBg : row.captionBg || row.captionEn;
    return {
      id: row.id,
      src: row.imageUrl,
      caption,
      alt: caption ? `${caption} — Pizza Pazzo` : "Pizza Pazzo",
    };
  });
}
