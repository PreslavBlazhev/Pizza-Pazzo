import { useTranslations } from "next-intl";
import type { CartTotals } from "@/types/cart";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";

/** Dual-currency (EUR primary + BGN) totals block for the cart and checkout. */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const t = useTranslations("cart");

  const row = (bgn: number, eur: number) => (
    <span className="text-right">
      <span className="font-medium text-pizza-ink">{formatEurPrice(eur)}</span>
      <span className="ml-2 text-xs text-pizza-muted">{formatBgnPrice(bgn)}</span>
    </span>
  );

  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex items-baseline justify-between text-pizza-muted">
        <span>{t("subtotal")}</span>
        {row(totals.subtotalBgn, totals.subtotal)}
      </div>
      <div className="flex items-baseline justify-between text-pizza-muted">
        <span>{t("deliveryFee")}</span>
        {row(totals.deliveryFeeBgn, totals.deliveryFee)}
      </div>
      <div className="flex items-baseline justify-between border-t border-pizza-cream-dark pt-2.5 text-base font-semibold text-pizza-ink">
        <span>{t("total")}</span>
        {row(totals.totalBgn, totals.total)}
      </div>
    </div>
  );
}
