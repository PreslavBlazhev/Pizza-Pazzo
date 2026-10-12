import galleryJson from "@/data/gallery.json";
import type { LocalizedText } from "@/types/i18n";

/** One gallery tile as stored: caption and alt text in both languages. */
interface RawGalleryItem {
  id: string;
  src: string;
  caption: LocalizedText;
  alt: LocalizedText;
}

/** One gallery tile, resolved for the reader's language. */
export interface GalleryItem {
  id: string;
  src: string;
  caption: string;
  alt: string;
}

const rawItems = galleryJson as RawGalleryItem[];

/** Number of tiles — known without a locale (for "is the gallery empty?"). */
export const galleryCount = rawItems.length;

/**
 * The gallery in one language. Texts live next to each picture in
 * data/gallery.json, so a new photo is added in one place, in both languages.
 */
export function getGalleryItems(locale: string): GalleryItem[] {
  const pick = (text: LocalizedText) => (locale === "en" ? text.en || text.bg : text.bg || text.en);
  return rawItems.map((item) => ({
    id: item.id,
    src: item.src,
    caption: pick(item.caption),
    alt: pick(item.alt),
  }));
}
