import { useTranslations } from "next-intl";
import type { CartItem as CartItemType } from "@/types/cart";
import { formatEur } from "@/lib/format-price";

/** Single cart line (placeholder — quantity controls wired in Stage 2). */
export function CartItem({ item }: { item: CartItemType }) {
  const t = useTranslations("cart");

  return (
    <div className="flex items-center justify-between border-b border-pizza-cream-dark py-3">
      <div>
        <p className="font-medium text-pizza-ink">{item.product.name}</p>
        {item.selectedVariant && (
          <p className="text-xs text-pizza-muted">{item.selectedVariant.name}</p>
        )}
        <p className="text-xs text-pizza-muted">
          {t("quantityShort", { count: item.quantity })}
        </p>
      </div>
      <span className="text-sm font-medium text-brand">
        {formatEur(item.unitPrice * item.quantity)}
      </span>
    </div>
  );
}
