import { useTranslations } from "next-intl";
import type { CartTotals } from "@/types/cart";
import { formatEurPrice } from "@/lib/format-price";

/**
 * Euro total for the cart and checkout. Delivery is free, so without an offer
 * it is one line; with the „Грешна математика“ pair it shows the products,
 * the discount and the amount to pay. With pizzas in the basket but no
 * discount, a short line says when the offer applies.
 */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const t = useTranslations("cart");

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
