/**
 * Price display: EUR is the PRIMARY currency, BGN the secondary one — every
 * dual price on the site reads "6.65 € / 13.01 лв.", never the reverse.
 * Both values always come from the data (priceEur/priceBgn pairs); nothing
 * here converts between currencies.
 */

/** Format a BGN price, e.g. 12.9 → "12.90 лв.". */
export function formatBgnPrice(price: number): string {
  return `${price.toFixed(2)} лв.`;
}

/** Format an EUR price, e.g. 6.6 → "6.60 €". */
export function formatEurPrice(price: number): string {
  return `${price.toFixed(2)} €`;
}

/** Dual display, EUR first: "6.65 € / 13.01 лв.". */
export function formatDualPrice(eur: number, bgn: number): string {
  return `${formatEurPrice(eur)} / ${formatBgnPrice(bgn)}`;
}
