"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Slim promotional announcement strip. The client confirmed they run
 * promotions; wording is intentionally generic until specific offers are given.
 */
export function PromoBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="relative bg-brand text-white">
      <div className="container flex items-center justify-center gap-3 py-2 text-center text-sm">
        <Link href="/menu" className="font-medium hover:underline">
          🎉 Специални седмични предложения — вижте нашето меню!
        </Link>
      </div>
      <button
        onClick={() => setOpen(false)}
        aria-label="Затвори съобщението"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/80 transition hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
