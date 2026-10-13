"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { Product, ProductVariant } from "@/types/product";
import type {
  CartExtraSelection,
  ProductExtraOption,
  ProductExtrasData,
} from "@/types/cart";
import { MAX_LINE_QUANTITY, useCartStore } from "@/store/cart-store";
import { StoreClosedBanner } from "@/components/store/StoreClosedBanner";
import { useStoreClosed } from "@/components/store/StoreStatusProvider";
import { EXTRAS_LIMITS, isRetiredExtraKey, parseVariantSize } from "@/lib/extras-rules";
import { formatEurPrice } from "@/lib/format-price";
import { cn } from "@/lib/utils";
import {
  ProductExtrasPicker,
  freeToppingsChosen,
  optionPriceFor,
  type ExtrasSelectionState,
} from "./ProductExtrasPicker";

/**
 * Unsaved choices on a product page (size, extras, quantity), per product, in
 * sessionStorage for this tab only. Switching BG ⇄ EN reloads the page in the
 * other language; without this, everything picked so far would be lost.
 * Cleared as soon as the choice goes into the basket.
 */
interface ProductDraft {
  editLineId: string | null;
  variantId: string | null;
  quantity: number;
  selected: ExtrasSelectionState;
}

const draftKey = (productId: string) => `pp-product-draft:${productId}`;

function readDraft(productId: string): ProductDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(productId));
    return raw ? (JSON.parse(raw) as ProductDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(productId: string, draft: ProductDraft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(draftKey(productId), JSON.stringify(draft));
    else window.sessionStorage.removeItem(draftKey(productId));
  } catch {
    // Storage blocked — the page still works, it just forgets on reload.
  }
}

/**
 * Purchase controls on the product page: size selection, the extras picker
 * (free toppings where the product includes them, paid add-ons, sauces), a
 * quantity stepper and the add-to-basket button.
 *
 * With `editLineId` (opened via "Edit" in the basket) the controls start from
 * that line and the button saves the change in place.
 *
 * Prices shown here are a PREVIEW computed exactly like the server does —
 * (base + extras per unit) × quantity, free toppings at 0 — and the checkout
 * server action re-derives everything from the database.
 */
export function AddToCart({
  product,
  extras = null,
  editLineId,
}: {
  product: Product;
  extras?: ProductExtrasData | null;
  editLineId?: string;
}) {
  const t = useTranslations("product");
  const tExtras = useTranslations("extras");
  const tStore = useTranslations("store");
  const router = useRouter();
  const addProduct = useCartStore((s) => s.addProduct);
  const replaceItem = useCartStore((s) => s.replaceItem);
  const storeClosed = useStoreClosed();

  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0;
  const [variant, setVariant] = useState<ProductVariant | undefined>(
    hasVariants ? variants[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<ExtrasSelectionState>({});
  const [justAdded, setJustAdded] = useState(false);
  /** The basket line being edited — null once it is saved or if it is gone. */
  const [editing, setEditing] = useState<string | null>(null);
  /** The edited line carried a retired generic option ("Месна добавка"),
   *  which is NOT carried over: the customer picks the ingredient again. */
  const [hadOutdatedExtras, setHadOutdatedExtras] = useState(false);

  const priceEur = variant?.priceEur ?? product.priceEur;

  // Numeric size of the chosen variant (30/40) — variant-priced extras follow it.
  const mainSize = useMemo(() => parseVariantSize(variant?.name), [variant]);

  // Options in render order (free toppings, crusts, addons, sauces) — used to
  // build the selection list deterministically and to look prices up by key.
  const orderedOptions = useMemo<ProductExtraOption[]>(
    () =>
      extras
        ? [
            ...(extras.freeToppings?.options ?? []),
            ...extras.crusts,
            ...extras.addons,
            ...extras.sauces,
          ]
        : [],
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
  const freeKeys = useMemo(
    () => new Set((extras?.freeToppings?.options ?? []).map((o) => o.key)),
    [extras]
  );
  const freeMax = extras?.freeToppings?.max ?? 0;

  // ── Start state: a draft from before a language switch wins, then the
  //    basket line being edited, then the defaults. Runs once on mount.
  const initialised = useRef(false);
  useEffect(() => {
    const keep = (sel: ExtrasSelectionState): ExtrasSelectionState =>
      Object.fromEntries(
        Object.entries(sel).filter(
          ([key, qty]) =>
            optionsByKey.has(key) && Number.isInteger(qty) && qty >= 1 && qty <= (optionsByKey.get(key)?.maxQuantity ?? 1)
        )
      );
    const findVariant = (id: string | null | undefined) =>
      id ? variants.find((v) => v.id === id) : undefined;

    const line = editLineId
      ? useCartStore.getState().items.find((i) => i.lineId === editLineId && i.product.id === product.id)
      : undefined;
    const draft = readDraft(product.id);
    const draftFits = draft && (draft.editLineId ?? null) === (line ? editLineId : null);

    if (draftFits && draft) {
      const v = findVariant(draft.variantId);
      if (v) setVariant(v);
      if (Number.isInteger(draft.quantity) && draft.quantity >= 1) {
        setQuantity(Math.min(MAX_LINE_QUANTITY, draft.quantity));
      }
      setSelectedExtras(keep(draft.selected ?? {}));
    } else if (line) {
      const v = findVariant(line.selectedVariant?.id);
      if (v) setVariant(v);
      setQuantity(line.quantity);
      setSelectedExtras(keep(Object.fromEntries((line.extras ?? []).map((e) => [e.key, e.quantity]))));
    }
    if (line && (line.extras ?? []).some((e) => isRetiredExtraKey(e.key))) {
      setHadOutdatedExtras(true);
    }
    setEditing(line ? editLineId ?? null : null);
    initialised.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Keep the draft current (after the start state has been applied).
  useEffect(() => {
    if (!initialised.current) return;
    writeDraft(product.id, {
      editLineId: editing,
      variantId: variant?.id ?? null,
      quantity,
      selected: selectedExtras,
    });
  }, [product.id, editing, variant, quantity, selectedExtras]);

  const selectedEntries = Object.entries(selectedExtras).filter(([, q]) => q > 0);
  const atEntryLimit = selectedEntries.length >= EXTRAS_LIMITS.maxExtrasPerItem;

  // A selected variant-priced extra with no price for the current size (e.g.
  // after a size change against incomplete data) blocks add-to-cart.
  const invalidSelection = selectedEntries.some(([key]) => {
    const option = optionsByKey.get(key);
    return option ? optionPriceFor(option, mainSize) === null : true;
  });

  // Preview extras total per ONE main unit (mirrors the server's semantics;
  // free toppings are priced 0, so they never move the total).
  // Added up in whole cents, so a long list of toppings never drifts.
  const extrasUnitCents = selectedEntries.reduce((acc, [key, qty]) => {
    const option = optionsByKey.get(key);
    const price = option ? optionPriceFor(option, mainSize) : null;
    return price === null ? acc : acc + Math.round(price * 100) * qty;
  }, 0);

  const totalEur = ((Math.round(priceEur * 100) + extrasUnitCents) * quantity) / 100;

  /**
   * Crusts are single-select (re-click deselects); addons toggle freely;
   * free toppings toggle up to their limit — a pick past it is ignored (the
   * picker also disables those rows).
   */
  function handleToggle(option: ProductExtraOption) {
    setSelectedExtras((prev) => {
      const next = { ...prev };
      if ((next[option.key] ?? 0) > 0) {
        delete next[option.key];
        return next;
      }
      if (freeKeys.has(option.key) && freeToppingsChosen(extras, prev) >= freeMax) {
        return prev;
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
    if (invalidSelection || storeClosed) return;
    // Build the cart selections in option render order (deterministic); the
    // display block is UI preview only — the checkout serializer drops it.
    const list: CartExtraSelection[] = [];
    for (const option of orderedOptions) {
      const qty = selectedExtras[option.key] ?? 0;
      if (qty < 1) continue;
      const price = optionPriceFor(option, mainSize);
      if (price === null) return; // guarded by invalidSelection, defensive here
      list.push({
        key: option.key,
        sourceProductId: option.sourceProductId,
        quantity: qty,
        display: {
          nameBg: option.nameBg,
          nameEn: option.nameEn,
          unitPriceEur: price,
          sizeContext:
            option.sizePrices && mainSize !== null ? `${mainSize} см` : undefined,
        },
      });
    }

    writeDraft(product.id, null);

    if (editing) {
      replaceItem(editing, product, variant, quantity, list);
      router.push("/cart");
      return;
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
    (extras.crusts.length > 0 ||
      extras.addons.length > 0 ||
      extras.sauces.length > 0 ||
      (extras.freeToppings?.options.length ?? 0) > 0);

  return (
    <div className="mt-8 space-y-5">
      {editing && (
        <p className="rounded-2xl border border-pizza-green/30 bg-pizza-green-light px-4 py-2.5 text-sm font-medium text-pizza-green-dark">
          {t("editingNotice")}
        </p>
      )}
      {editing && hadOutdatedExtras && (
        <p
          role="status"
          data-testid="extras-outdated-notice"
          className="rounded-2xl border border-brand/30 bg-pizza-red-light px-4 py-2.5 text-sm font-medium text-brand-dark"
        >
          {tExtras("outdatedNotice")}
        </p>
      )}

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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasExtras && extras && (
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

      {/* Says why the button below will not work; renders nothing while open. */}
      <StoreClosedBanner />

      <div className="flex flex-wrap items-center gap-4">
        {/* Quantity stepper */}
        <div className="inline-flex items-center rounded-full border border-pizza-cream-dark bg-white">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label={t("decreaseQuantity")}
            className="min-h-11 px-4 py-2.5 text-lg font-semibold text-pizza-ink transition hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <span aria-live="polite" className="min-w-8 text-center text-sm font-semibold text-pizza-ink">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
            disabled={quantity >= MAX_LINE_QUANTITY}
            aria-label={t("increaseQuantity")}
            className="min-h-11 px-4 py-2.5 text-lg font-semibold text-pizza-ink transition hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={invalidSelection || storeClosed}
          className={cn(
            "flex-1 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-soft transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 sm:flex-none sm:px-10",
            justAdded ? "bg-pizza-green" : "bg-brand hover:bg-brand-dark",
            (invalidSelection || storeClosed) && "cursor-not-allowed opacity-60 hover:bg-brand"
          )}
        >
          {storeClosed
            ? tStore("closedShort")
            : justAdded
              ? t("added")
              : editing
                ? t("saveChanges")
                : `🛒 ${t("addToCart")}`}
        </button>

        <div className="flex items-end gap-2" data-testid="product-total">
          <span className="font-display text-2xl font-bold text-brand">
            {formatEurPrice(totalEur)}
          </span>
        </div>
      </div>

      {/* Secondary navigation — back to the basket while editing, otherwise
          back to the menu. Sits under the primary CTA. */}
      <Link
        href={editing ? "/cart" : "/menu"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-pizza-ink/15 bg-white px-6 py-3 text-sm font-semibold text-pizza-ink transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 sm:w-auto sm:px-10"
      >
        <span aria-hidden>←</span> {editing ? t("backToCart") : t("backToMenu")}
      </Link>
    </div>
  );
}
