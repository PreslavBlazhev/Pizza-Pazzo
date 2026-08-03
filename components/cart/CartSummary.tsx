import { useTranslations } from "next-intl";
import type { CartTotals } from "@/types/cart";
import { formatEurPrice } from "@/lib/format-price";

/** Euro totals block for the cart and checkout. */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const t = useTranslations("cart");

  const row = (eur: number) => (
    <span className="text-right">
      <span className="font-medium text-pizza-ink">{formatEurPrice(eur)}</span>
    </span>
  );

  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex items-baseline justify-between text-pizza-muted">
        <span>{t("subtotal")}</span>
        {row(totals.subtotal)}
      </div>
      <div className="flex items-baseline justify-between text-pizza-muted">
        <span>{t("deliveryFee")}</span>
        {row(totals.deliveryFee)}
      </div>
      <div className="flex items-baseline justify-between border-t border-pizza-cream-dark pt-2.5 text-base font-semibold text-pizza-ink">
        <span>{t("total")}</span>
        {row(totals.total)}
      </div>
    </div>
  );
}
