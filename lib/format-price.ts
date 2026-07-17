import { EUR_TO_BGN } from "./constants";

/** Format a BGN price, e.g. 12.9 → "12.90 лв.". */
export function formatBgnPrice(price: number): string {
  return `${price.toFixed(2)} лв.`;
}

/** Format an EUR price, e.g. 6.6 → "6.60 €". */
export function formatEurPrice(price: number): string {
  return `${price.toFixed(2)} €`;
}

// ── Legacy helpers (kept for older placeholder code: admin/print) ──────────

/** @deprecated use formatEurPrice */
export function formatEur(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/** Convert an EUR amount to BGN and format. */
export function formatBgn(amountEur: number): string {
  return `${(amountEur * EUR_TO_BGN).toFixed(2)} лв.`;
}

/** Dual display from a single EUR amount, e.g. "€9.50 / 18.58 лв.". */
export function formatDualPrice(amountEur: number): string {
  return `${formatEur(amountEur)} / ${formatBgn(amountEur)}`;
}
