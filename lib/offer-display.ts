/**
 * How the two-pizza combos are SHOWN — the one place every surface takes its
 * wording from: basket and checkout (CartSummary), the customer e-mail, the
 * restaurant e-mail, the admin order page, the live board, the web ticket and
 * the Android print job.
 *
 * In the active mode (lib/pizza-math.ts, "never_dearer") a combo exists only
 * when it makes the order CHEAPER, so Order.discountEur (regular − package)
 * is positive whenever there is a combo, and 0 without one. The other
 * branches stay as a defensive guard for any stored value (and the unused
 * "fixed" mode): shown, an amount must never read as a negative "discount"
 * or a double minus:
 *   discountEur > 0  → "Отстъпка „Грешна математика“   −2.55 €"
 *   discountEur < 0  → "Разлика до пакетната цена      +2.55 €"
 *   discountEur = 0  → no money line (the combo line itself still shows)
 * and every combo is listed with its package price AND the regular price it
 * replaces, so the customer sees exactly what the package costs.
 *
 * Pure and dependency-free (relative imports only).
 */
import { comboSizesLabel, type ComboSizes } from "./pizza-math";

export type OfferAdjustmentKind = "discount" | "surcharge" | "none";

export interface OfferAdjustment {
  kind: OfferAdjustmentKind;
  /** Always ≥ 0 — the sign is carried by `kind`. */
  amountEur: number;
}

/** Splits the stored signed difference into what to show. Whole cents. */
export function offerAdjustment(discountEur: number): OfferAdjustment {
  const cents = Math.round((Number.isFinite(discountEur) ? discountEur : 0) * 100);
  if (cents > 0) return { kind: "discount", amountEur: cents / 100 };
  if (cents < 0) return { kind: "surcharge", amountEur: -cents / 100 };
  return { kind: "none", amountEur: 0 };
}

/** Bulgarian label of the money line (staff surfaces and the BG e-mails). */
export function adjustmentLabelBg(kind: OfferAdjustmentKind): string | null {
  if (kind === "discount") return "Отстъпка „Грешна математика“";
  if (kind === "surcharge") return "Разлика до пакетната цена";
  return null;
}

/**
 * The amount with its sign: "−2.55 €" / "+2.55 €". `minus` lets plain-text
 * and thermal paths use an ASCII "-" (a printer code page may lack "−").
 */
export function signedAdjustment(
  adj: OfferAdjustment,
  format: (eur: number) => string,
  minus = "−"
): string {
  if (adj.kind === "none") return format(0);
  return `${adj.kind === "discount" ? minus : "+"}${format(adj.amountEur)}`;
}

/** What a combo line needs — a stored snapshot or a basket pair. */
export interface ComboLike {
  sizes: ComboSizes;
  comboEur: number;
  regularEur: number;
}

/** "Оферта 2 пици 40 + 30 см: 19.43 € (редовно 22.49 €)". */
export function comboLineBg(combo: ComboLike, format: (eur: number) => string): string {
  return `Оферта 2 пици ${comboSizesLabel(combo.sizes)}: ${format(combo.comboEur)} (редовно ${format(
    combo.regularEur
  )})`;
}
