/**
 * Price display: the euro is the ONLY currency on the site — every price reads
 * "6.65 €". Values always come from the data (priceEur); nothing here converts
 * between currencies.
 */

/**
 * A product's displayed price: the admin's free text when one is set (shown
 * as typed; " €" is added only when the text ends in a digit and has no €
 * of its own, so "7.50/12.00" → "7.50/12.00 €" but "по договаряне" stays),
 * otherwise the formatted number.
 */
export function formatProductPrice(product: {
  priceEur: number;
  priceLabel?: string | null;
}): string {
  const label = product.priceLabel?.trim();
  if (!label) return formatEurPrice(product.priceEur);
  return /\d$/.test(label) && !label.includes("€") ? `${label} €` : label;
}

/** Format an EUR price, e.g. 6.6 → "6.60 €". */
export function formatEurPrice(price: number): string {
  return `${price.toFixed(2)} €`;
}
