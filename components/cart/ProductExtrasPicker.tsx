"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ProductExtraOption, ProductExtrasData } from "@/types/cart";
import { formatEurPrice } from "@/lib/format-price";
import { cn } from "@/lib/utils";

/**
 * Extras picker on the product page: two compact dropdowns side by side —
 * add-ons (crust + the rest) on the left, sauces on the right. Each is a
 * disclosure (button + panel), not a native <select>, because the panels hold
 * checkboxes, quantity steppers and dual prices.
 *
 * Pure presentation: the selection state lives in <AddToCart /> (the owner),
 * which derives per-size prices and writes to the cart store on submit. The
 * props contract is unchanged from the previous always-open list.
 */

/** Selection state: option key → quantity (1 for crust/addons, 1–10 sauces). */
export type ExtrasSelectionState = Record<string, number>;

/**
 * Resolves the EUR price an option carries for the current pizza size.
 * `null` means "not orderable at this size" — callers must test against null,
 * never truthiness, since 0 is a legitimate price.
 */
export function optionPriceFor(
  option: ProductExtraOption,
  mainSize: number | null
): number | null {
  if (option.sizePrices) {
    if (mainSize === null) return null;
    const match = option.sizePrices.find((p) => p.size === mainSize);
    return match ? match.priceEur : null;
  }
  return option.priceEur ?? 0;
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

/**
 * One collapsible section. Closing on Escape and on an outside click is done
 * with a ref plus two listeners — no dropdown library, and the panel stays in
 * the normal flow so opening it just expands the section.
 */
function ExtrasDisclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const node = wrapperRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="self-start">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition",
          "hover:border-pizza-green/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 focus-visible:ring-offset-2",
          open ? "border-pizza-green" : "border-pizza-cream-dark"
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-pizza-ink">{title}</span>
          <span className="block text-xs text-pizza-muted">{summary}</span>
        </span>
        <span
          aria-hidden
          className={cn(
            "shrink-0 text-pizza-muted transition-transform duration-200",
            open && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>

      {/* Height/opacity transition on a wrapper keeps the open/close smooth
          without measuring the content. */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div
            id={panelId}
            hidden={!open}
            className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-pizza-cream-dark bg-pizza-cream/40 p-3 shadow-sm"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
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

  const priceTag = (eur: number) => (
    <span className="shrink-0 whitespace-nowrap text-right">
      <span className="text-sm font-semibold text-brand">+{formatEurPrice(eur)}</span>
    </span>
  );

  /** Checkbox-style row for crusts and addons (crust exclusivity is enforced
   *  by the owner; re-clicking a selected row deselects it). */
  const toggleRow = (option: ProductExtraOption) => {
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
          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 focus-visible:ring-offset-1",
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
          priceTag(price)
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
          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition",
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
          {price !== null && (
            <p className="text-xs text-pizza-muted">+{formatEurPrice(price)}</p>
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

  const hasAddons = extras.crusts.length > 0 || extras.addons.length > 0;
  const hasSauces = extras.sauces.length > 0;

  // Closed-state summaries. Add-ons count distinct choices; sauces count total
  // units, because "3 sauces" means three jars, not three kinds.
  const addonCount = [...extras.crusts, ...extras.addons].filter(
    (o) => (selected[o.key] ?? 0) > 0
  ).length;
  const sauceUnits = extras.sauces.reduce((sum, o) => sum + (selected[o.key] ?? 0), 0);

  const addonSummary =
    addonCount === 0 ? t("noneSelected") : t("selectedCount", { count: addonCount });
  const sauceSummary =
    sauceUnits === 0 ? t("noneSelected") : t("saucesCount", { count: sauceUnits });

  return (
    <div
      className={cn(
        "grid gap-4 text-left",
        hasAddons && hasSauces ? "md:grid-cols-2" : "md:grid-cols-1"
      )}
    >
      {hasAddons && (
        <ExtrasDisclosure title={t("title")} summary={addonSummary}>
          {extras.crusts.length > 0 && (
            <>
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-pizza-muted">
                {t("crustGroup")}
              </p>
              {extras.crusts.map(toggleRow)}
            </>
          )}
          {extras.addons.length > 0 && (
            <>
              {extras.crusts.length > 0 && (
                <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-pizza-muted">
                  {t("otherAddons")}
                </p>
              )}
              {extras.addons.map(toggleRow)}
            </>
          )}
        </ExtrasDisclosure>
      )}

      {hasSauces && (
        <ExtrasDisclosure title={t("saucesTitle")} summary={sauceSummary}>
          {extras.sauces.map(sauceRow)}
        </ExtrasDisclosure>
      )}
    </div>
  );
}
