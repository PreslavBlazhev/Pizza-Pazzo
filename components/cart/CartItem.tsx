"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CartItem as CartItemType } from "@/types/cart";
import { linePreviewTotalEur, lineUnitPreviewEur, useCartStore } from "@/store/cart-store";
import { formatEurPrice } from "@/lib/format-price";
import {
  cartExtraName,
  cartProductName,
  cartVariantName,
  type CartLineIssue,
} from "@/lib/cart-display";
import { isRetiredExtraKey } from "@/lib/extras-rules";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A single basket line with its extras, quantity controls, an edit link back
 * to the product page and a remove button. Names follow the active language.
 */
export function CartItem({ item, issue = null }: { item: CartItemType; issue?: CartLineIssue | null }) {
  const unavailable = issue === "unavailable" || issue === "addon-only";
  const t = useTranslations("cart");
  const locale = useLocale();
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const extras = item.extras ?? [];
  const name = cartProductName(item, locale);
  const variantName = cartVariantName(item, locale);

  return (
    <div className="flex items-start justify-between gap-4 border-b border-pizza-cream-dark py-4">
      <div className="min-w-0">
        <p className="font-medium text-pizza-ink">{name}</p>
        {variantName && <p className="text-xs text-pizza-muted">{variantName}</p>}
        {issue === "unavailable" && (
          <p role="status" data-testid="cart-line-unavailable" className="mt-1 text-xs font-medium text-brand-dark">
            {t("unavailable")}
          </p>
        )}
        {issue === "addon-only" && (
          <p role="status" data-testid="cart-line-addon-only" className="mt-1 text-xs font-medium text-brand-dark">
            {t("addonOnly")}
          </p>
        )}
        {issue === "extras-outdated" && (
          <p role="status" data-testid="cart-line-extras-outdated" className="mt-1 text-xs font-medium text-brand-dark">
            {t("extrasOutdated")}
          </p>
        )}

        {/* Chosen extras — display preview captured at add time; "Edit"
            reopens the product with them pre-selected. */}
        {extras.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs text-pizza-muted">
            {extras.map((e) => (
              // A retired generic option is shown crossed out: it will not be
              // charged or cooked, the customer chooses again.
              <li key={e.key} className={isRetiredExtraKey(e.key) ? "break-words line-through" : "break-words"}>
                + {e.quantity > 1 ? `${e.quantity}× ` : ""}
                {cartExtraName(e, locale)}
                {e.display && (
                  <span className="whitespace-nowrap">
                    {" — "}
                    {e.display.unitPriceEur === 0
                      ? t("free")
                      : formatEurPrice(round2(e.display.unitPriceEur * e.quantity))}
                  </span>
                )}
              </li>
            ))}
            {item.quantity > 1 && <li className="italic">{t("extrasPerItem")}</li>}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          {/* Quantity stepper */}
          <div className="inline-flex items-center rounded-full border border-pizza-cream-dark bg-white">
            <button
              type="button"
              onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
              disabled={item.quantity <= 1}
              aria-label={t("decreaseQuantity", { name })}
              className="min-h-10 min-w-10 px-3 py-1.5 font-semibold text-pizza-ink transition hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span aria-live="polite" className="min-w-6 text-center text-sm font-semibold text-pizza-ink">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
              disabled={item.quantity >= 99}
              aria-label={t("increaseQuantity", { name })}
              className="min-h-10 min-w-10 px-3 py-1.5 font-semibold text-pizza-ink transition hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>

          {!unavailable && <Link
            href={{ pathname: `/product/${item.product.slug || item.product.id}`, query: { edit: item.lineId } }}
            aria-label={t("editItem", { name })}
            className="text-xs font-medium text-pizza-green underline-offset-2 transition hover:underline"
          >
            {issue === "extras-outdated" ? t("reselectExtras") : t("edit")}
          </Link>}

          <button
            type="button"
            onClick={() => removeItem(item.lineId)}
            aria-label={t("removeItem", { name })}
            className="text-xs font-medium text-pizza-muted underline-offset-2 transition hover:text-brand hover:underline"
          >
            {t("remove")}
          </button>
        </div>
      </div>

      {/* Line total including the extras preview. */}
      <div className="shrink-0 text-right">
        <p className="font-semibold text-brand">{formatEurPrice(linePreviewTotalEur(item))}</p>
        {/* How the line total is made: quantity × the price of one (base +
            its extras). Extras are charged on EVERY unit, so without this a
            2× line looked as if it had been charged its extras twice. */}
        {item.quantity > 1 && (
          <p className="mt-0.5 whitespace-nowrap text-xs text-pizza-muted">
            {item.quantity} × {formatEurPrice(lineUnitPreviewEur(item))}
          </p>
        )}
      </div>
    </div>
  );
}
