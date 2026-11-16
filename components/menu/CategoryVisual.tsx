"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { Category } from "@/types/category";
import { cn } from "@/lib/utils";

/**
 * The picture of a category on the public site: the photo uploaded from
 * Admin → Категории (object-cover in a fixed-ratio box), or — while a category
 * has no photo yet, or the file fails to load — its legacy emoji.
 *
 * The caller sizes the box via `className` (width/height or aspect ratio);
 * `emojiClassName` sizes the fallback emoji. `decorative` is for places where
 * the category name is right next to a tiny thumbnail (nav pills), so screen
 * readers don't hear the name twice.
 */
export function CategoryVisual({
  category,
  className,
  emojiClassName,
  sizes,
  decorative = false,
  priority = false,
}: {
  category: Pick<Category, "name" | "icon" | "imageUrl">;
  className?: string;
  emojiClassName?: string;
  sizes: string;
  decorative?: boolean;
  priority?: boolean;
}) {
  const t = useTranslations("menu");
  const [failed, setFailed] = useState(false);
  const src = category.imageUrl && !failed ? category.imageUrl : null;

  if (!src) {
    if (!category.icon) return null;
    return (
      <span className={cn("inline-flex items-center justify-center", emojiClassName)} aria-hidden>
        {category.icon}
      </span>
    );
  }

  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-pizza-cream", className)}>
      <Image
        src={src}
        alt={decorative ? "" : t("categoryPhotoAlt", { name: category.name })}
        aria-hidden={decorative || undefined}
        fill
        sizes={sizes}
        priority={priority}
        // /uploads/* lives on the Persistent Disk, not /public — the Next
        // optimizer can't read it (same as ProductImage). The file is already
        // a resized WebP (lib/uploads/image-processing.ts).
        unoptimized
        onError={() => setFailed(true)}
        className="object-cover"
      />
    </span>
  );
}
