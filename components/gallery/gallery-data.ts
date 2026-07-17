import galleryJson from "@/data/gallery.json";

export interface GalleryItem {
  id: string;
  src: string;
  alt: string;
}

export const galleryItems = galleryJson as GalleryItem[];
