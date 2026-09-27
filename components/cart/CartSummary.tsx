import { useTranslations } from "next-intl";
import type { CartTotals } from "@/types/cart";
import { formatEurPrice } from "@/lib/format-price";

/** Euro total for the cart and checkout (delivery is free, so it is one line). */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const t = useTranslations("cart");

  return (
    <div className="flex items-baseline justify-between text-base font-semibold text-pizza-ink">
      <span>{t("total")}</span>
      <span className="text-right">{formatEurPrice(totals.total)}</span>
    </div>
  );
}
