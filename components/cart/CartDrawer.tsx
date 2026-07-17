"use client";

import { useTranslations } from "next-intl";

/**
 * Slide-in cart drawer (placeholder).
 * Will read from the cart store and render CartItem/CartSummary in Stage 2.
 */
export function CartDrawer({ open }: { open?: boolean }) {
  const t = useTranslations("cart");

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-50 h-full w-80 border-l border-pizza-cream-dark bg-white p-4 shadow-xl">
      <p className="font-semibold text-pizza-ink">{t("title")}</p>
      <p className="mt-2 text-sm text-pizza-muted">{t("empty")}</p>
    </div>
  );
}
