"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Tiny client-only wrapper around the locale-aware Link, isolated to just the
 * one place that needs an event handler (Space-key activation on the product
 * image). Keeping this separate — instead of marking the whole ProductCard
 * "use client" — lets ProductCard stay a Server Component, so the menu/home/
 * popular grids don't ship this card's JS to the client for every product.
 */
export function ProductImageLink({
  href,
  ariaLabel,
  className,
  children,
}: {
  href: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={className}
      onKeyDown={(e) => {
        // A plain <a> only activates on Enter natively; Space is expected too
        // (the image is being made keyboard-activatable like a button).
        if (e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
    >
      {children}
    </Link>
  );
}
