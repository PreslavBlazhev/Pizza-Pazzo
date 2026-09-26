/**
 * Money in the smallest currency unit — dependency-free, safe anywhere.
 *
 * The order stores euros as a Prisma Decimal (SQLite keeps it as REAL, so a
 * total can come back as 23.519999999). A payment provider wants an integer
 * number of cents. Converting with `Math.round(x * 100)` on a drifted float is
 * exactly how "23.52 € on the screen, 2351 at the bank" happens, so the value
 * is rounded to two decimals as a DECIMAL STRING first and only then turned
 * into an integer. Half-up, like every other rounding in this project.
 */

/** Anything the order layer hands us: Prisma Decimal, number, or "23.52". */
export type MoneyInput = number | string | { toString(): string };

/**
 * Euros (or any 2-decimal currency) → integer minor units.
 * Throws on NaN, infinities and negative amounts — a payment can never be
 * started from a value nobody can read.
 */
export function toMinorUnits(value: MoneyInput): number {
  const n = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${String(value)}`);
  if (n < 0) throw new Error(`Negative amount: ${String(value)}`);

  // toFixed(10) collapses float noise (23.519999999999996 → "23.5200000000")
  // before the two-decimal half-up rounding below looks at the digits.
  const [intPart, fracRaw = ""] = n.toFixed(10).split(".");
  const frac = fracRaw.padEnd(3, "0");
  let cents = Number(intPart) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return cents;
}

/** Integer minor units → euros as a number with at most two decimals. */
export function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100;
}

/** "23.52 €" — the same format as formatEurPrice on the rest of the site. */
export function formatMinor(minor: number, currency: string): string {
  const value = fromMinorUnits(minor).toFixed(2);
  return currency === "EUR" ? `${value} €` : `${value} ${currency}`;
}
