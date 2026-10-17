import { useLocale, useTranslations } from "next-intl";
import type { CartTotals } from "@/types/cart";
import { formatEurPrice } from "@/lib/format-price";
import { comboSizesLabel } from "@/lib/pizza-math";
import { offerAdjustment, signedAdjustment } from "@/lib/offer-display";

/**
 * Euro total for the cart and checkout. Delivery is free, so without an offer
 * it is one line. With „Грешна математика“ combos (only pairs that really
 * save) it shows the products, every combo with its package price and the
 * regular price it replaces, the discount and the amount to pay. With
 * standard pizzas but no combo, a short line says how the offer works; a
 * basket of special pizzas only gets no such promise.
 */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const t = useTranslations("cart");
  const unit = useLocale() === "en" ? "cm" : "см";
  const adj = offerAdjustment(totals.discount);
  const hasCombos = totals.combos.length > 0;

  return (
    <div className="space-y-1.5">
      {hasCombos && (
        <>
          <div className="flex items-baseline justify-between text-sm text-pizza-muted">
            <span>{t("subtotal")}</span>
            <span className="text-right" data-testid="cart-subtotal">
              {formatEurPrice(totals.subtotal)}
            </span>
          </div>
          {totals.combos.map((c, i) => (
            <div
              key={`${c.sizes}-${i}`}
              className="flex items-baseline justify-between gap-3 text-xs text-pizza-muted"
              data-testid="cart-combo"
            >
              <span>
                {t("pizzaMathCombo", {
                  sizes: comboSizesLabel(c.sizes, unit),
                  regular: formatEurPrice(c.regularEur),
                })}
              </span>
              <span className="whitespace-nowrap text-right">{formatEurPrice(c.comboEur)}</span>
            </div>
          ))}
          {adj.kind !== "none" && (
            <div
              className={`flex items-baseline justify-between gap-3 text-sm font-medium ${
                adj.kind === "discount" ? "text-pizza-green-dark" : "text-pizza-ink"
              }`}
            >
              <span>{adj.kind === "discount" ? t("pizzaMathDiscount") : t("pizzaMathSurcharge")}</span>
              <span
                className="whitespace-nowrap text-right"
                data-testid={adj.kind === "discount" ? "cart-discount" : "cart-surcharge"}
              >
                {signedAdjustment(adj, formatEurPrice)}
              </span>
            </div>
          )}
        </>
      )}
      <div className="flex items-baseline justify-between text-base font-semibold text-pizza-ink">
        <span>{t("total")}</span>
        <span className="text-right" data-testid="cart-total">
          {formatEurPrice(totals.total)}
        </span>
      </div>
      {!hasCombos && totals.comboPizzaCount > 0 && (
        <p className="text-xs text-pizza-muted" data-testid="pizza-math-hint">
          {t("pizzaMathHint")}
        </p>
      )}
    </div>
  );
}
