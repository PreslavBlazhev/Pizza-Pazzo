"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CartItem as CartItemType } from "@/types/cart";
import { linePreviewTotalEur, useCartStore } from "@/store/cart-store";
import { formatEurPrice } from "@/lib/format-price";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A single cart line with its extras, quantity controls and a remove button. */
export function CartItem({ item }: { item: CartItemType }) {
  const t = useTranslations("cart");
  const locale = useLocale();
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const extras = item.extras ?? [];

  return (
    <div className="flex items-start justify-between gap-4 border-b border-pizza-cream-dark py-4">
      <div className="min-w-0">
        <p className="font-medium text-pizza-ink">{item.product.name}</p>
        {item.selectedVariant && (
          <p className="text-xs text-pizza-muted">{item.selectedVariant.name}</p>
        )}

        {/* Chosen extras — display preview captured at add time. Not editable
            here: remove the line and re-add to change them. */}
        {extras.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs text-pizza-muted">
            {extras.map((e) => {
              const name = e.display
                ? locale === "en"
                  ? e.display.nameEn
                  : e.display.nameBg
                : e.key;
              return (
                <li key={e.key} className="break-words">
                  + {e.quantity > 1 ? `${e.quantity}× ` : ""}
                  {name}
                  {e.display && (
                    <span className="whitespace-nowrap">
                      {" — "}
                      {formatEurPrice(round2(e.display.unitPriceEur * e.quantity))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
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

      {/* Line total including the extras preview. */}
      <div className="shrink-0 text-right">
        <p className="font-semibold text-brand">{formatEurPrice(linePreviewTotalEur(item))}</p>
      </div>
    </div>
  );
}
