import { ProductImage } from "@/components/menu/ProductImage";
import type { GalleryItem } from "./gallery-data";

interface GalleryGridProps {
  items: GalleryItem[];
  /** Enlarge the first tile to a 2×2 feature cell. */
  feature?: boolean;
}

export function GalleryGrid({ items, feature = true }: GalleryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`group relative overflow-hidden rounded-2xl border border-pizza-cream-dark bg-pizza-cream ${
            feature && i === 0 ? "col-span-2 row-span-2" : ""
          }`}
        >
          <div className="aspect-square">
            <ProductImage
              src={item.src}
              alt={item.alt}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="transition duration-500 group-hover:scale-105"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
