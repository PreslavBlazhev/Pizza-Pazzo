/**
 * Display formatting for order extras (добавки/сосове) — the single place that
 * turns an immutable `OrderItemExtra` snapshot into something readable.
 *
 * Used by the admin order views, the customer order history, both order emails,
 * the 80mm web ticket and the Android printer adapter, so none of them
 * re-implement locale picking or the per-unit wording.
 *
 * PRICE SEMANTICS (same as the snapshot, see lib/extras-rules.ts): `quantity`
 * and `totalPrice*` are per ONE unit of the main order item. A line of
 * "2× Маргарита" with a sauce at quantity 2 therefore means two sauces on each
 * of the two pizzas — hence the "за всяка бройка" wording helpers below.
 *
 * Internal fields (key, sourceProductId, sourceVariantId) are deliberately not
 * part of the display shape: they must never reach a customer or a receipt.
 *
 * Dependency-free on purpose (relative imports only, no next-intl, no `@/`
 * alias) so scripts/smoke-checkout.mjs can compile and unit-test it.
 */
import type { ExtraType, OrderItemExtra } from "./extras-rules";

/** One extra, ready to render. Money is a plain number in both currencies. */
export interface OrderExtraDisplay {
  name: string;
  quantity: number;
  /** Size the price was matched against ("30 см") — only for sized addons. */
  sizeContext?: string;
  unitPriceEur: number;
  /** Price for `quantity` of this extra, on ONE unit of the main item. */
  totalPriceEur: number;
  type: ExtraType;
}

/**
 * Picks the name for the given locale, falling back to the other language
 * rather than rendering an empty string (a snapshot from an older order may
 * carry only one of the two).
 */
function pickName(extra: OrderItemExtra, locale: string): string {
  const bg = extra.nameBg?.trim() ?? "";
  const en = extra.nameEn?.trim() ?? "";
  if (locale === "en") return en || bg;
  return bg || en;
}

/** Maps one snapshot entry to its display shape. */
export function toOrderExtraDisplay(
  extra: OrderItemExtra,
  locale: string
): OrderExtraDisplay {
  return {
    name: pickName(extra, locale),
    quantity: extra.quantity,
    sizeContext: extra.sizeContext,
    unitPriceEur: extra.unitPriceEur,
    totalPriceEur: extra.totalPriceEur,
    type: extra.type,
  };
}

/** Maps a whole extras array; an empty/missing array yields []. */
export function toOrderExtrasDisplay(
  extras: readonly OrderItemExtra[] | null | undefined,
  locale: string
): OrderExtraDisplay[] {
  if (!extras || extras.length === 0) return [];
  return extras.map((e) => toOrderExtraDisplay(e, locale));
}

/**
 * "Кашкавален борд" / "2× Чеснов сос" — the quantity prefix appears only when
 * more than one was ordered (crusts and addons are always exactly one).
 */
export function extraLabel(extra: OrderExtraDisplay, multiplySign = "×"): string {
  return extra.quantity > 1
    ? `${extra.quantity}${multiplySign} ${extra.name}`
    : extra.name;
}

/**
 * Marks a name as applying to every unit of a multi-quantity line (Bulgarian —
 * staff-facing surfaces are BG-only). Returns the name unchanged for single
 * units, where the hint would only add noise.
 */
export function withPerUnitHint(name: string, mainQuantity: number): string {
  return mainQuantity > 1 ? `${name} / всяка` : name;
}

/**
 * Kitchen/receipt label in Bulgarian: "2x Чеснов сос / всяка" when the main
 * item has more than one unit, so the kitchen reads the extras as per-pizza
 * rather than per-order. Use where the renderer does NOT add its own quantity
 * prefix (the web ticket, the emails) — the Android formatter does, so there
 * pass the bare name through {@link withPerUnitHint} instead.
 */
export function extraKitchenLabel(
  extra: OrderExtraDisplay,
  mainQuantity: number
): string {
  return withPerUnitHint(extraLabel(extra, "x"), mainQuantity);
}
