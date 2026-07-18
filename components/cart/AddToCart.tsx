"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Product, ProductVariant } from "@/types/product";
import { useCartStore } from "@/store/cart-store";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { cn } from "@/lib/utils";

/**
 * Purchase controls on the product page: size selection (for products with
 * variants), a quantity stepper and the add-to-cart button. Client component —
 * it writes to the persisted cart store.
 */
export function AddToCart({ product }: { product: Product }) {
  const t = useTranslations("product");
  const tCart = useTranslations("cart");
  const addProduct = useCartStore((s) => s.addProduct);

  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0;
  const [variant, setVariant] = useState<ProductVariant | undefined>(
    hasVariants ? variants[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const priceBgn = variant?.priceBgn ?? product.priceBgn;
  const priceEur = variant?.priceEur ?? product.priceEur;

  function handleAdd() {
    addProduct(product, variant, quantity);
    setJustAdded(true);
    setQuantity(1);
    window.setTimeout(() => setJustAdded(false), 1600);
  }

  if (!product.isAvailable) {
    return (
      <div className="mt-9">
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-full bg-pizza-cream-dark px-6 py-3.5 text-sm font-semibold text-pizza-muted sm:w-auto sm:px-10"
        >
          {t("outOfStock")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      {hasVariants && (
        <div>
          <p className="mb-3 text-sm font-semibold text-pizza-ink">{t("chooseSize")}</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const active = v.id === variant?.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariant(v)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-2xl border px-4 py-2.5 text-sm shadow-sm transition",
                    active
                      ? "border-pizza-green bg-pizza-green-light"
                      : "border-pizza-cream-dark bg-white hover:border-pizza-green/50"
                  )}
                >
                  <span className="font-medium text-pizza-ink">{v.name}</span>
                  <span className="ml-2 font-semibold text-brand">
                    {formatEurPrice(v.priceEur)}
                  </span>
                  <span className="ml-1.5 text-xs text-pizza-muted">
                    {formatBgnPrice(v.priceBgn)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {/* Quantity stepper */}
        <div className="inline-flex items-center rounded-full border border-pizza-cream-dark bg-white">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label={tCart("remove")}
            className="px-4 py-2.5 text-lg font-semibold text-pizza-ink transition hover:text-brand"
          >
            −
          </button>
          <span className="min-w-8 text-center text-sm font-semibold text-pizza-ink">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            aria-label={tCart("quantity")}
            className="px-4 py-2.5 text-lg font-semibold text-pizza-ink transition hover:text-brand"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className={cn(
            "flex-1 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-soft transition sm:flex-none sm:px-10",
            justAdded ? "bg-pizza-green" : "bg-brand hover:bg-brand-dark"
          )}
        >
          {justAdded ? t("added") : `🛒 ${t("addToCart")}`}
        </button>

        <div className="flex items-end gap-2">
          <span className="font-display text-2xl font-bold text-brand">
            {formatEurPrice(priceEur * quantity)}
          </span>
          <span className="pb-0.5 text-sm text-pizza-muted">
            {formatBgnPrice(priceBgn * quantity)}
          </span>
        </div>
      </div>
    </div>
  );
}
