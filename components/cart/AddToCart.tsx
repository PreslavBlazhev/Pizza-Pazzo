"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Product, ProductVariant } from "@/types/product";
import type {
  CartExtraSelection,
  ProductExtraOption,
  ProductExtrasData,
} from "@/types/cart";
import { useCartStore } from "@/store/cart-store";
import { EXTRAS_LIMITS, parseVariantSize } from "@/lib/extras-rules";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { cn } from "@/lib/utils";
import {
  ProductExtrasPicker,
  optionPriceFor,
  type ExtrasSelectionState,
} from "./ProductExtrasPicker";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Purchase controls on the product page: size selection, the extras picker
 * (crust/addons/sauces), a quantity stepper and the add-to-cart button.
 * Client component — owns the local selection state and writes to the
 * persisted cart store. Prices shown here are a PREVIEW; the checkout server
 * action re-derives everything from the database.
 */
export function AddToCart({
  product,
  extras = null,
}: {
  product: Product;
  extras?: ProductExtrasData | null;
}) {
  const t = useTranslations("product");
  const tCart = useTranslations("cart");
  const tExtras = useTranslations("extras");
  const addProduct = useCartStore((s) => s.addProduct);

  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0;
  const [variant, setVariant] = useState<ProductVariant | undefined>(
    hasVariants ? variants[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<ExtrasSelectionState>({});
  const [justAdded, setJustAdded] = useState(false);

  const priceBgn = variant?.priceBgn ?? product.priceBgn;
  const priceEur = variant?.priceEur ?? product.priceEur;

  // Numeric size of the chosen variant (30/40) — variant-priced extras follow it.
  const mainSize = useMemo(() => parseVariantSize(variant?.name), [variant]);

  // Options in render order (crusts, addons, sauces) — used to build the
  // selection list deterministically and to look prices up by key.
  const orderedOptions = useMemo<ProductExtraOption[]>(
    () => (extras ? [...extras.crusts, ...extras.addons, ...extras.sauces] : []),
    [extras]
  );
  const optionsByKey = useMemo(
    () => new Map(orderedOptions.map((o) => [o.key, o])),
    [orderedOptions]
  );
  const crustKeys = useMemo(
    () => new Set((extras?.crusts ?? []).map((o) => o.key)),
    [extras]
  );

  const selectedEntries = Object.entries(selectedExtras).filter(([, q]) => q > 0);
  const atEntryLimit = selectedEntries.length >= EXTRAS_LIMITS.maxExtrasPerItem;

  // A selected variant-priced extra with no price for the current size (e.g.
  // after a size change against incomplete data) blocks add-to-cart.
  const invalidSelection = selectedEntries.some(([key]) => {
    const option = optionsByKey.get(key);
    return option ? optionPriceFor(option, mainSize) === null : true;
  });

  // Preview extras total per ONE main unit (mirrors the server's semantics).
  const extrasUnit = selectedEntries.reduce(
    (acc, [key, qty]) => {
      const option = optionsByKey.get(key);
      const price = option ? optionPriceFor(option, mainSize) : null;
      if (!price) return acc;
      return {
        eur: round2(acc.eur + price.eur * qty),
        bgn: round2(acc.bgn + price.bgn * qty),
      };
    },
    { eur: 0, bgn: 0 }
  );

  const totalEur = round2(round2(priceEur + extrasUnit.eur) * quantity);
  const totalBgn = round2(round2(priceBgn + extrasUnit.bgn) * quantity);

  /** Crusts are single-select (re-click deselects); addons toggle freely. */
  function handleToggle(option: ProductExtraOption) {
    setSelectedExtras((prev) => {
      const next = { ...prev };
      if ((next[option.key] ?? 0) > 0) {
        delete next[option.key];
        return next;
      }
      if (crustKeys.has(option.key)) {
        for (const k of crustKeys) delete next[k];
      }
      next[option.key] = 1;
      return next;
    });
  }

  function handleSauceChange(option: ProductExtraOption, delta: 1 | -1) {
    setSelectedExtras((prev) => {
      const current = prev[option.key] ?? 0;
      const next = Math.min(option.maxQuantity, Math.max(0, current + delta));
      if (next === current) return prev;
      const copy = { ...prev };
      if (next === 0) delete copy[option.key];
      else copy[option.key] = next;
      return copy;
    });
  }

  function handleAdd() {
    if (invalidSelection) return;
    // Build the cart selections in option render order (deterministic); the
    // display block is UI preview only — the checkout serializer drops it.
    const list: CartExtraSelection[] = [];
    for (const option of orderedOptions) {
      const qty = selectedExtras[option.key] ?? 0;
      if (qty < 1) continue;
      const price = optionPriceFor(option, mainSize);
      if (!price) return; // guarded by invalidSelection, defensive here
      list.push({
        key: option.key,
        sourceProductId: option.sourceProductId,
        quantity: qty,
        display: {
          nameBg: option.nameBg,
          nameEn: option.nameEn,
          unitPriceEur: price.eur,
          unitPriceBgn: price.bgn,
          sizeContext:
            option.sizePrices && mainSize !== null ? `${mainSize} см` : undefined,
        },
      });
    }
    addProduct(product, variant, quantity, list);
    setJustAdded(true);
    setQuantity(1);
    setSelectedExtras({});
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

  const hasExtras =
    extras !== null &&
    (extras.crusts.length > 0 || extras.addons.length > 0 || extras.sauces.length > 0);

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

      {hasExtras && (
        <ProductExtrasPicker
          extras={extras}
          mainSize={mainSize}
          selected={selectedExtras}
          atEntryLimit={atEntryLimit}
          onToggle={handleToggle}
          onSauceChange={handleSauceChange}
        />
      )}

      {invalidSelection && (
        <p className="rounded-2xl border border-brand/30 bg-pizza-red-light px-4 py-2.5 text-sm font-medium text-brand-dark">
          {tExtras("invalidSelection")}
        </p>
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
          disabled={invalidSelection}
          className={cn(
            "flex-1 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-soft transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 sm:flex-none sm:px-10",
            justAdded ? "bg-pizza-green" : "bg-brand hover:bg-brand-dark",
            invalidSelection && "cursor-not-allowed opacity-60 hover:bg-brand"
          )}
        >
          {justAdded ? t("added") : `🛒 ${t("addToCart")}`}
        </button>

        <div className="flex items-end gap-2">
          <span className="font-display text-2xl font-bold text-brand">
            {formatEurPrice(totalEur)}
          </span>
          <span className="pb-0.5 text-sm text-pizza-muted">
            {formatBgnPrice(totalBgn)}
          </span>
        </div>
      </div>

      {/* Secondary navigation back to the menu — sits under the primary CTA. */}
      <Link
        href="/menu"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-pizza-ink/15 bg-white px-6 py-3 text-sm font-semibold text-pizza-ink transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 sm:w-auto sm:px-10"
      >
        <span aria-hidden>←</span> {t("backToMenu")}
      </Link>
    </div>
  );
}
