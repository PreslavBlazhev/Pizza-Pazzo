import { useTranslations } from "next-intl";
import type { CartTotals } from "@/types/cart";
import { formatEur } from "@/lib/format-price";

/** Totals block shown in the cart and checkout (placeholder). */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const t = useTranslations("cart");

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-pizza-muted">
        <span>{t("subtotal")}</span>
        <span>{formatEur(totals.subtotal)}</span>
      </div>
      <div className="flex justify-between text-pizza-muted">
        <span>{t("deliveryFee")}</span>
        <span>{formatEur(totals.deliveryFee)}</span>
      </div>
      <div className="flex justify-between border-t border-pizza-cream-dark pt-2 font-semibold text-pizza-ink">
        <span>{t("total")}</span>
        <span>{formatEur(totals.total)}</span>
      </div>
    </div>
  );
}
