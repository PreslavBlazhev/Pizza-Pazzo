import type { CartItem as CartItemType } from "@/types/cart";
import { formatEur } from "@/lib/format-price";

/** Single cart line (placeholder — quantity controls wired in Stage 2). */
export function CartItem({ item }: { item: CartItemType }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-3">
      <div>
        <p className="font-medium text-neutral-800">{item.product.name}</p>
        {item.selectedVariant && (
          <p className="text-xs text-neutral-500">{item.selectedVariant.name}</p>
        )}
        <p className="text-xs text-neutral-500">Кол.: {item.quantity}</p>
      </div>
      <span className="text-sm font-medium text-brand">
        {formatEur(item.unitPrice * item.quantity)}
      </span>
    </div>
  );
}
