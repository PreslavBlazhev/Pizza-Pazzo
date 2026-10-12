/**
 * „Грешна математика, правилни оферти“ — the two-pizza combo price.
 *
 * The owner's rules (2026-10-12), applied to online delivery orders:
 *   - the combo prices are 30+30 → 16.87 €, 40+30 → 19.43 €, 40+40 → 23.01 €;
 *   - it applies ONLY when the order holds exactly 2 pizzas, counted by
 *     quantity (one line × 2 is two pizzas). With 3 or more pizzas every
 *     pizza is charged at its normal price — nothing is paired off;
 *   - the speciality pizzas (category cat_pizzas_special) are excluded, but
 *     they still count as pizzas: a speciality pizza in the order means the
 *     pair is not eligible, and three pizzas are three;
 *   - the pair costs the LOWER of its two regular base prices together and
 *     the combo price — the offer never makes an order dearer;
 *   - paid extras are charged on top, per pizza, as always: the combo
 *     replaces only the two base prices.
 *
 * One function, used by the basket, the checkout page and the server
 * (lib/checkout/place-order.ts) — the server feeds it its own menu prices.
 *
 * Pure and dependency-free (relative imports only), like lib/extras-rules.ts.
 */
import { PIZZA_CATEGORY_IDS, parseVariantSize } from "./extras-rules";

/** The categories whose pizzas may form the pair. Speciality pizzas are not here. */
export const PIZZA_MATH_CATEGORY_IDS = ["cat_pizzas_standard"] as const;

/** Combo price for a pair of sizes, keyed "small+large" in cm. */
export const PIZZA_MATH_PRICES_EUR: Readonly<Record<string, number>> = {
  "30+30": 16.87,
  "30+40": 19.43,
  "40+40": 23.01,
};

/** The facts about one basket/order line the rule needs. */
export interface PizzaMathLine {
  categoryId: string;
  /** Name of the chosen size variant ("30 см", "40 cm", "30 см / 30 cm"). */
  variantName?: string | null;
  /** Base price of ONE unit, without extras. */
  baseUnitEur: number;
  quantity: number;
}

export interface PizzaMathResult {
  /** True when the order is an eligible pair (even if the combo saves nothing). */
  eligible: boolean;
  /** Regular base price of the two pizzas together (0 when not eligible). */
  regularEur: number;
  /** The combo price for the pair's sizes (0 when not eligible). */
  comboEur: number;
  /** What the customer saves: regular − combo, never below 0. */
  discountEur: number;
}

const NONE: PizzaMathResult = { eligible: false, regularEur: 0, comboEur: 0, discountEur: 0 };

const toCents = (n: number) => Math.round(n * 100);

function isAnyPizza(categoryId: string): boolean {
  return (PIZZA_CATEGORY_IDS as readonly string[]).includes(categoryId);
}

function isComboPizza(categoryId: string): boolean {
  return (PIZZA_MATH_CATEGORY_IDS as readonly string[]).includes(categoryId);
}

export function pizzaMathDiscount(lines: readonly PizzaMathLine[]): PizzaMathResult {
  // Every pizza unit in the order, speciality pizzas included.
  const units: PizzaMathLine[] = [];
  for (const line of lines) {
    if (!isAnyPizza(line.categoryId)) continue;
    const qty = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0;
    for (let i = 0; i < qty; i++) {
      units.push(line);
      if (units.length > 2) return NONE; // 3+ pizzas: normal prices for all
    }
  }
  if (units.length !== 2) return NONE;
  if (!units.every((u) => isComboPizza(u.categoryId))) return NONE;

  const sizes = units.map((u) => parseVariantSize(u.variantName));
  if (sizes.some((s) => s === null)) return NONE;
  const [a, b] = (sizes as number[]).sort((x, y) => x - y);
  const combo = PIZZA_MATH_PRICES_EUR[`${a}+${b}`];
  if (combo === undefined) return NONE;

  const regularCents = units.reduce((s, u) => s + toCents(u.baseUnitEur), 0);
  const discountCents = Math.max(0, regularCents - toCents(combo));
  return {
    eligible: true,
    regularEur: regularCents / 100,
    comboEur: combo,
    discountEur: discountCents / 100,
  };
}
