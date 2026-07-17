"use client";

import { useCartStore, useCartHydrated } from "@/store/cart-store";

/**
 * Count bubble for the header cart link. Renders nothing until the cart has
 * hydrated (so SSR and first paint match) or when the cart is empty. The parent
 * element must be `relative` for the absolute positioning to anchor correctly.
 */
export function CartBadge() {
  const hydrated = useCartHydrated();
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  if (!hydrated || count === 0) return null;

  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold leading-none text-white shadow-sm">
      {count}
    </span>
  );
}
