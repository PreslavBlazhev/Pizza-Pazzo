"use client";

import { useEffect, useState } from "react";
import { unavailableCartProducts } from "@/app/actions/cart";
import type { CartItem } from "@/types/cart";

/**
 * Product ids in the basket that are no longer on sale, asked of the server
 * whenever the set of products changes. Empty while asking or when the
 * question fails — the server refuses such a product at checkout anyway.
 */
export function useUnavailableProducts(items: readonly CartItem[]): ReadonlySet<string> {
  const idsKey = [...new Set(items.map((i) => i.product.id))].sort().join(",");
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!idsKey) {
      setUnavailable(new Set());
      return;
    }
    let cancelled = false;
    unavailableCartProducts(idsKey.split(","))
      .then((ids) => {
        if (!cancelled) setUnavailable(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setUnavailable(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return unavailable;
}
