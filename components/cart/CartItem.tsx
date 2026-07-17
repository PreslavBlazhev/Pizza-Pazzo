"use client";

import { useTranslations } from "next-intl";
import type { CartItem as CartItemType } from "@/types/cart";
import { useCartStore } from "@/store/cart-store";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";

/** A single cart line with quantity controls and a remove button. */
export function CartItem({ item }: { item: CartItemType }) {
  const t = useTranslations("cart");
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const unitBgn = item.selectedVariant?.priceBgn ?? item.product.priceBgn;
  const unitEur = item.unitPrice;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-pizza-cream-dark py-4">
      <div className="min-w-0">
        <p className="font-medium text-pizza-ink">{item.product.name}</p>
        {item.selectedVariant && (
          <p className="text-xs text-pizza-muted">{item.selectedVariant.name}</p>
        )}

        <div className="mt-2 flex items-center gap-3">
          {/* Quantity stepper */}
          <div className="inline-flex items-center rounded-full border border-pizza-cream-dark bg-white">
            <button
              type="button"
              onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
              aria-label="−"
              className="px-3 py-1.5 font-semibold text-pizza-ink transition hover:text-brand"
            >
              −
            </button>
            <span className="min-w-6 text-center text-sm font-semibold text-pizza-ink">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
              aria-label="+"
              className="px-3 py-1.5 font-semibold text-pizza-ink transition hover:text-brand"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => removeItem(item.lineId)}
            className="text-xs font-medium text-pizza-muted underline-offset-2 transition hover:text-brand hover:underline"
          >
            {t("remove")}
          </button>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-semibold text-brand">
          {formatBgnPrice(unitBgn * item.quantity)}
        </p>
        <p className="text-xs text-pizza-muted">
          {formatEurPrice(unitEur * item.quantity)}
        </p>
      </div>
    </div>
  );
}
