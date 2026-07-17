"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
}

/**
 * Renders a product image from `src` (always product.imageUrl).
 * If there is no src, or it fails to load, a branded placeholder is shown.
 * When the admin later uploads a real photo, only imageUrl changes — no code.
 */
export function ProductImage({ src, alt, className }: ProductImageProps) {
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
          Снимка скоро
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
