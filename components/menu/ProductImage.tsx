"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  /**
   * Responsive hint for next/image (how wide the image renders per viewport).
   * Tune per grid at the call site; the default fits the product-card grids.
   */
  sizes?: string;
}

/**
 * Renders a product image from `src` (always product.imageUrl).
 * If there is no src, or it fails to load, a branded placeholder is shown.
 * When the admin later uploads a real photo, only imageUrl changes — no code.
 */
export function ProductImage({
  src,
  alt,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: ProductImageProps) {
  const t = useTranslations("product");
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  if (showPlaceholder) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-pizza-cream to-pizza-cream-dark text-center",
          className
        )}
      >
        <span className="text-3xl" aria-hidden>🍕</span>
        <span className="mt-2 font-display text-lg font-semibold text-brand">
          Pizza Pazzo
        </span>
        <span className="mt-0.5 text-[11px] uppercase tracking-widest text-pizza-green">
          {t("imageSoon")}
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        // The optimizer rejects SVG (the current placeholders) and can't read
        // /uploads/* — those live on the Persistent Disk, not /public, so
        // Next's local-file optimizer would 400 on them (see
        // lib/uploads/paths.ts). Static /images/... photos still go through
        // it and get resized/WebP'd automatically.
        unoptimized={src.endsWith(".svg") || src.startsWith("/uploads/")}
        onError={() => setFailed(true)}
        className={cn("object-cover", className)}
      />
    </div>
  );
}
