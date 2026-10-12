"use client";

import { useTranslations } from "next-intl";
import { DELIVERY_AREA, minimumOrderShortfallEur } from "@/lib/delivery-area";
import { formatEurPrice } from "@/lib/format-price";
import { cn } from "@/lib/utils";

/**
 * The delivery minimum, said where the customer decides: in the basket and at
 * checkout. Below it, it says how much is missing and that this is not a fee;
 * at or above it, a quiet one-line reminder. The server enforces the same rule
 * (lib/checkout/place-order.ts) with the same function.
 */
export function MinimumOrderNotice({
  subtotalEur,
  className,
}: {
  subtotalEur: number;
  className?: string;
}) {
  const t = useTranslations("cart");
  const minimum = DELIVERY_AREA.minimumOrderEur;
  if (minimum === null) return null;

  const shortfall = minimumOrderShortfallEur(subtotalEur);
  const amount = formatEurPrice(minimum);

  if (shortfall === 0) {
    return (
      <p className={cn("text-xs text-pizza-muted", className)}>
        {t("minimumOrder", { amount })}
      </p>
    );
  }

  return (
    <p
      role="status"
      data-testid="minimum-order-shortfall"
      className={cn(
        "rounded-2xl border border-brand/30 bg-pizza-red-light px-4 py-3 text-sm font-medium text-brand-dark",
        className
      )}
    >
      {t("minimumOrderShortfall", { amount, remaining: formatEurPrice(shortfall) })}
    </p>
  );
}
