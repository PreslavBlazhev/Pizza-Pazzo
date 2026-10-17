import { useLocale, useTranslations } from "next-intl";
import type { CartTotals } from "@/types/cart";
import { formatEurPrice } from "@/lib/format-price";
import { comboSizesLabel } from "@/lib/pizza-math";

/**
 * Euro total for the cart and checkout. Delivery is free, so without an offer
 * it is one line; with the „Грешна математика“ pair it shows the products,
 * the discount and the amount to pay. With pizzas in the basket but no
 * discount, a short line says when the offer applies.
 */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const t = useTranslations("cart");
  const unit = useLocale() === "en" ? "cm" : "см";

  return (
    <div className="space-y-1.5">
      {totals.discount > 0 && (
        <>
          <div className="flex items-baseline justify-between text-sm text-pizza-muted">
            <span>{t("subtotal")}</span>
            <span className="text-right" data-testid="cart-subtotal">
              {formatEurPrice(totals.subtotal)}
            </span>
          </div>
          {totals.combos.map((c) => (
            <div
              key={c.sizes}
              className="flex items-baseline justify-between gap-3 text-xs text-pizza-muted"
              data-testid="cart-combo"
            >
              <span>
                {t("pizzaMathCombo", { sizes: comboSizesLabel(c.sizes, unit) })}
              </span>
              <span className="whitespace-nowrap text-right">
                {c.count > 1 ? `${c.count} × ` : ""}
                {formatEurPrice(c.comboEur)}
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 text-sm font-medium text-pizza-green-dark">
            <span>{t("pizzaMathDiscount")}</span>
            <span className="whitespace-nowrap text-right" data-testid="cart-discount">
              −{formatEurPrice(totals.discount)}
            </span>
          </div>
        </>
      )}
      <div className="flex items-baseline justify-between text-base font-semibold text-pizza-ink">
        <span>{t("total")}</span>
        <span className="text-right" data-testid="cart-total">
          {formatEurPrice(totals.total)}
        </span>
      </div>
      {totals.discount === 0 && totals.pizzaCount > 0 && (
        <p className="text-xs text-pizza-muted" data-testid="pizza-math-hint">
          {t("pizzaMathHint")}
        </p>
      )}
    </div>
  );
}
