/**
 * Price display: the euro is the ONLY currency on the site — every price reads
 * "6.65 €". Values always come from the data (priceEur); nothing here converts
 * between currencies.
 */

/** Format an EUR price, e.g. 6.6 → "6.60 €". */
export function formatEurPrice(price: number): string {
  return `${price.toFixed(2)} €`;
}
