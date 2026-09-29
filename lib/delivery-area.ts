/**
 * Where and how the restaurant delivers — pure and dependency-free (imported
 * by the checkout form in the browser, by placeOrder on the server, by the
 * legal pages and by the tests), so every one of them applies the SAME rule.
 *
 * Confirmed facts only:
 *   - the delivery town is Pleven (confirmed 2026-07-20, docs/client-delivery-questions.md);
 *   - delivery is free (owner's decision 2026-09-27);
 *   - the site takes delivery orders only — there is no pickup option in the
 *     order flow (Order.deliveryMethod is always DELIVERY);
 *   - the site applies no minimum order amount.
 *
 * NOT confirmed and therefore NOT modelled: a list of districts/villages or a
 * radius. Any address in the town is accepted by the server; the terms say
 * the restaurant may call and decline an address it cannot reach. When the
 * owner defines zones, they belong here (and the terms version is bumped).
 */

export interface DeliveryTown {
  /** Canonical spelling stored on the order. */
  bg: string;
  en: string;
}

export const DELIVERY_AREA = {
  towns: [{ bg: "Плевен", en: "Pleven" }] as readonly DeliveryTown[],
  /** Delivery fee in EUR — free. */
  feeEur: 0,
  /** Minimum order in EUR — none. */
  minimumOrderEur: null as number | null,
  /** Customers may collect the order themselves through the site. */
  pickupAvailable: false,
} as const;

/** "гр. Плевен", " PLEVEN ", "град плевен" → "плевен". */
function normalizeTown(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(гр\.|град|gr\.|grad|town of|city of)\s*/u, "")
    .replace(/[.,]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * The canonical town (BG spelling, as stored on orders) when `raw` names a
 * town we deliver to; null otherwise. The server's check — the browser only
 * shows the same answer earlier.
 */
export function resolveDeliveryTown(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const wanted = normalizeTown(raw);
  if (!wanted) return null;
  const hit = DELIVERY_AREA.towns.find(
    (t) => normalizeTown(t.bg) === wanted || normalizeTown(t.en) === wanted
  );
  return hit ? hit.bg : null;
}

/** "Плевен" / "Pleven" — for the texts that list where we deliver. */
export function deliveryTownsLabel(locale: string): string {
  return DELIVERY_AREA.towns.map((t) => (locale === "en" ? t.en : t.bg)).join(", ");
}
