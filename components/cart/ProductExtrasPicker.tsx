"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ProductExtraOption, ProductExtrasData } from "@/types/cart";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { cn } from "@/lib/utils";

/**
 * Extras picker on the product page: crust single-select, independent addon
 * checkboxes, sauce quantity steppers. Pure presentation — the selection state
 * lives in <AddToCart /> (the owner), which also derives per-size prices and
 * writes to the cart store on submit.
 */

/** Selection state: option key → quantity (1 for crust/addons, 1–10 sauces). */
export type ExtrasSelectionState = Record<string, number>;

/** Resolves the price an option carries for the current pizza size. */
export function optionPriceFor(
  option: ProductExtraOption,
  mainSize: number | null
): { eur: number; bgn: number } | null {
  if (option.sizePrices) {
    if (mainSize === null) return null;
    const match = option.sizePrices.find((p) => p.size === mainSize);
    return match ? { eur: match.priceEur, bgn: match.priceBgn } : null;
  }
  return { eur: option.priceEur ?? 0, bgn: option.priceBgn ?? 0 };
}

interface ProductExtrasPickerProps {
  extras: ProductExtrasData;
  /** Numeric size of the chosen main variant (30/40), null when unknown. */
  mainSize: number | null;
  selected: ExtrasSelectionState;
  /** True when 15 distinct extras are already chosen — new entries disabled. */
  atEntryLimit: boolean;
  /** Toggles a crust (single-select) or an addon (independent). */
  onToggle: (option: ProductExtraOption) => void;
  /** Adjusts a sauce quantity by ±1 (0 removes it). */
  onSauceChange: (option: ProductExtraOption, delta: 1 | -1) => void;
}

export function ProductExtrasPicker({
  extras,
  mainSize,
  selected,
  atEntryLimit,
  onToggle,
  onSauceChange,
}: ProductExtrasPickerProps) {
  const t = useTranslations("extras");
  const locale = useLocale();

  const nameOf = (o: ProductExtraOption) => (locale === "en" ? o.nameEn : o.nameBg);
  const sizeLabelOf = (o: ProductExtraOption) =>
    locale === "en" ? o.sizeLabelEn : o.sizeLabelBg;

  const priceTag = (eur: number, bgn: number) => (
    <span className="shrink-0 whitespace-nowrap text-right">
      <span className="text-sm font-semibold text-brand">+{formatEurPrice(eur)}</span>
      <span className="ml-1 text-xs text-pizza-muted">{formatBgnPrice(bgn)}</span>
    </span>
  );

  /** Checkbox-style card for crusts and addons (crust exclusivity is enforced
   *  by the owner; re-clicking a selected card deselects it). */
  const toggleCard = (option: ProductExtraOption) => {
    const isSelected = (selected[option.key] ?? 0) > 0;
    const price = optionPriceFor(option, mainSize);
    const unavailable = price === null;
    const disabled = unavailable || (!isSelected && atEntryLimit);
    const label = sizeLabelOf(option);

    return (
      <button
        key={option.key}
        type="button"
        aria-pressed={isSelected}
        disabled={disabled}
        onClick={() => onToggle(option)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 focus-visible:ring-offset-2",
          isSelected
            ? "border-pizza-green bg-pizza-green-light"
            : "border-pizza-cream-dark bg-white hover:border-pizza-green/50",
          disabled && "cursor-not-allowed opacity-60 hover:border-pizza-cream-dark"
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {/* Selected state carries a checkmark, not just a colour change. */}
          <span
            aria-hidden
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
              isSelected
                ? "border-pizza-green bg-pizza-green text-white"
                : "border-pizza-cream-dark bg-white text-transparent"
            )}
          >
            ✓
          </span>
          <span className="min-w-0 text-sm font-medium text-pizza-ink">
            {nameOf(option)}
            {label && (
              <span className="ml-1.5 text-xs font-normal text-pizza-muted">({label})</span>
            )}
          </span>
        </span>
        {unavailable ? (
          <span className="shrink-0 text-xs italic text-pizza-muted">
            {t("unavailableForSize")}
          </span>
        ) : (
          priceTag(price.eur, price.bgn)
        )}
      </button>
    );
  };

  const sauceRow = (option: ProductExtraOption) => {
    const qty = selected[option.key] ?? 0;
    const price = optionPriceFor(option, mainSize);
    const name = nameOf(option);
    const label = sizeLabelOf(option);
    const atMax = qty >= option.maxQuantity;
    const plusDisabled = atMax || (qty === 0 && atEntryLimit);

    return (
      <div
        key={option.key}
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2 shadow-sm transition",
          qty > 0 ? "border-pizza-green bg-pizza-green-light" : "border-pizza-cream-dark bg-white"
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-pizza-ink">
            {name}
            {label && (
              <span className="ml-1.5 text-xs font-normal text-pizza-muted">({label})</span>
            )}
          </p>
          {price && (
            <p className="text-xs text-pizza-muted">
              +{formatEurPrice(price.eur)} <span>{formatBgnPrice(price.bgn)}</span>
            </p>
          )}
        </div>

        <div className="inline-flex shrink-0 items-center rounded-full border border-pizza-cream-dark bg-white">
          <button
            type="button"
            onClick={() => onSauceChange(option, -1)}
            disabled={qty === 0}
            aria-label={t("decreaseQuantity", { name })}
            className="px-3 py-1.5 text-base font-semibold text-pizza-ink transition hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50"
          >
            −
          </button>
          <span
            aria-live="polite"
            className="min-w-6 text-center text-sm font-semibold text-pizza-ink"
          >
            {qty}
          </span>
          <button
            type="button"
            onClick={() => onSauceChange(option, 1)}
            disabled={plusDisabled}
            aria-label={t("increaseQuantity", { name })}
            title={atMax ? t("maxQuantityReached") : undefined}
            className="px-3 py-1.5 text-base font-semibold text-pizza-ink transition hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  const hasLeftColumn = extras.crusts.length > 0 || extras.addons.length > 0;
  const hasSauces = extras.sauces.length > 0;

  return (
    <div
      className={cn(
        "grid gap-6 text-left",
        hasLeftColumn && hasSauces ? "md:grid-cols-2" : "md:grid-cols-1"
      )}
    >
      {hasLeftColumn && (
        <div className="space-y-5 self-start">
          {extras.crusts.length > 0 && (
            <div>
              <h3 className="mb-2.5 text-sm font-semibold text-pizza-ink">
                {t("crustTitle")}
              </h3>
              <div className="space-y-2">{extras.crusts.map(toggleCard)}</div>
            </div>
          )}
          {extras.addons.length > 0 && (
            <div>
              <h3 className="mb-2.5 text-sm font-semibold text-pizza-ink">{t("title")}</h3>
              <div className="space-y-2">{extras.addons.map(toggleCard)}</div>
            </div>
          )}
        </div>
      )}

      {hasSauces && (
        <div className="self-start">
          <h3 className="mb-2.5 text-sm font-semibold text-pizza-ink">{t("saucesTitle")}</h3>
          <div className="space-y-2">{extras.sauces.map(sauceRow)}</div>
        </div>
      )}
    </div>
  );
}
