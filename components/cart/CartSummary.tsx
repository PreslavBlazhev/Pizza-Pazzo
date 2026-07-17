import type { CartTotals } from "@/types/cart";
import { formatEur } from "@/lib/format-price";

/** Totals block shown in the cart and checkout (placeholder). */
export function CartSummary({ totals }: { totals: CartTotals }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-neutral-600">
        <span>Междинна сума</span>
        <span>{formatEur(totals.subtotal)}</span>
      </div>
      <div className="flex justify-between text-neutral-600">
        <span>Доставка</span>
        <span>{formatEur(totals.deliveryFee)}</span>
      </div>
      <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-800">
        <span>Общо</span>
        <span>{formatEur(totals.total)}</span>
      </div>
    </div>
  );
}
