/**
 * „Грешна математика, правилни оферти“ — automatic two-pizza combos.
 *
 * Fixed prices for the BASES of two pizzas, whatever pizzas they are:
 *   30 см + 30 см → 16.87 €   (1687 cents)
 *   40 см + 30 см → 19.43 €   (1943 cents)
 *   40 см + 40 см → 23.01 €   (2301 cents)
 *
 * Rules (owner's brief of 2026-10-17, see IMPLEMENTATION_REPORT.md §3):
 *   - automatic: no promo code, nothing to switch on;
 *   - a pizza is a line whose MENU CATEGORY is a pizza category
 *     (PIZZA_COMBO_CATEGORY_IDS) and whose size variant parses to 30 or 40 —
 *     never a match on the product's name. Other sizes and categories never
 *     take part;
 *   - a line with quantity 2 is two pizzas; two identical pizzas pair;
 *   - every physical pizza is in at most one pair;
 *   - with 3+ pizzas the maximum number of pairs is formed, and among all the
 *     possible ways to pair them the one with the LOWEST total for the
 *     customer is chosen (an odd pizza out pays its normal price). The result
 *     depends only on the multiset of (size, price) — never on the order in
 *     which the basket was filled;
 *   - extras (crusts, toppings, sauces) are never part of the combo price:
 *     they are charged at their own price and quantity, on top;
 *   - everything is whole cents; the combo prices are integers, never
 *     converted.
 *
 * Pricing mode. The owner's earlier rule (2026-10-12) was that the offer may
 * never make an order DEARER: a pair whose two regular prices together are
 * below the combo price keeps its regular price. The current menu has such
 * pairs (Маргарита/Кашкавалина: 30+30 = 13.30 €, 30+40 = 16.88 €, 40+40 =
 * 20.46 €), so making the combo prices strictly "fixed" would charge those
 * customers more. That is a business decision, so it is a single switch:
 *   "never_dearer" (DEFAULT, the rule the owner already approved) — a pair
 *                  costs min(regular, combo);
 *   "fixed"        — a pair always costs exactly the combo price, even when
 *                  that is more than the regular prices.
 * The same function runs in the basket and on the server, so both always
 * agree; the server feeds it its own menu prices and categories.
 *
 * ALGORITHM. Pizza units are split into the 30 list and the 40 list, each
 * sorted by price (descending, ties by line key). A pairing is described by
 * x mixed pairs, y 30+30 pairs and z 40+40 pairs. For fixed (x, y, z) the
 * paired units' prices are replaced by fixed combo prices, so the discount is
 *     D(x, y, z) = S30(x + 2y) + S40(x + 2z) − (1943x + 1687y + 2301z)
 * where Sk(n) is the sum of the n most expensive units of size k: whatever
 * goes into a pair loses its own price, so the best choice of units for given
 * counts is always the most expensive ones, and WHO pairs with whom inside
 * the chosen set does not change the sum. The optimum is therefore the best
 * (x, y, z):
 *   - "fixed":        x + y + z = ⌊n/2⌋ (the maximum number of pairs);
 *   - "never_dearer": any x, y, z — a pair that would cost more than its
 *                     regular price is simply not discounted, which is the
 *                     same as leaving it unpaired. In an optimal choice no
 *                     chosen pair has a negative discount (dropping it would
 *                     raise D), so every displayed combo really saves money,
 *                     and the remaining pizzas can always be "paired" at
 *                     their regular price: the maximum number of pairs and
 *                     the lowest total coincide.
 * tests/pizza-combos.test.ts proves this against exhaustive enumeration of
 * every possible pairing on small baskets.
 *
 * Pure and dependency-free (relative imports only), like lib/extras-rules.ts.
 */
import { PIZZA_CATEGORY_IDS, parseVariantSize } from "./extras-rules";

export type ComboPricingMode = "never_dearer" | "fixed";

/** The active mode — see the module comment before changing it. */
export const COMBO_PRICING_MODE: ComboPricingMode = "never_dearer";

/**
 * The categories whose pizzas take part: every pizza category of the menu,
 * standard and speciality alike ("независимо от вида им").
 */
export const PIZZA_COMBO_CATEGORY_IDS: readonly string[] = PIZZA_CATEGORY_IDS;

export type ComboSizes = "30+30" | "30+40" | "40+40";

/** Combo price in cents for a pair of sizes ("small+large"). */
export const PIZZA_COMBO_PRICES_CENTS: Readonly<Record<ComboSizes, number>> = {
  "30+30": 1687,
  "30+40": 1943,
  "40+40": 2301,
};

/** The same in euros, for display. */
export const PIZZA_MATH_PRICES_EUR: Readonly<Record<ComboSizes, number>> = {
  "30+30": 16.87,
  "30+40": 19.43,
  "40+40": 23.01,
};

/** The facts about one basket/order line the rule needs. */
export interface PizzaMathLine {
  /** Stable id of the line (cart lineId / order line index) — for the split. */
  key?: string;
  categoryId: string;
  /** Name of the chosen size variant ("30 см", "40 cm", "30 см / 30 cm"). */
  variantName?: string | null;
  /** Base price of ONE unit, without extras. */
  baseUnitEur: number;
  quantity: number;
}

/** One combo, as stored on the order and shown everywhere. */
export interface PizzaComboPair {
  sizes: ComboSizes;
  comboEur: number;
  /** The two pizzas' regular base prices together. */
  regularEur: number;
  /** regular − combo (negative only in "fixed" mode). */
  discountEur: number;
  /** The two lines the pizzas come from (the same key twice for qty ≥ 2). */
  lineKeys: [string, string];
}

export interface PizzaMathResult {
  /** True when at least one combo applies. */
  eligible: boolean;
  pairs: PizzaComboPair[];
  /** Σ regular base prices of the paired pizzas. */
  regularEur: number;
  /** Σ combo prices. */
  comboEur: number;
  /** What the customer saves overall (negative only in "fixed" mode). */
  discountEur: number;
  discountCents: number;
  /**
   * The discount split over the lines, in euros (whole cents). The values
   * add up to `discountEur` exactly — no cent lost or invented.
   */
  lineDiscountsEur: Record<string, number>;
}

const EMPTY: PizzaMathResult = {
  eligible: false,
  pairs: [],
  regularEur: 0,
  comboEur: 0,
  discountEur: 0,
  discountCents: 0,
  lineDiscountsEur: {},
};

const toCents = (n: number) => Math.round(n * 100);

interface Unit {
  key: string;
  cents: number;
}

/** A pizza unit's size if the line takes part (30 or 40), else null. */
export function comboSizeOf(line: Pick<PizzaMathLine, "categoryId" | "variantName">): 30 | 40 | null {
  if (!PIZZA_COMBO_CATEGORY_IDS.includes(line.categoryId)) return null;
  const size = parseVariantSize(line.variantName);
  return size === 30 || size === 40 ? size : null;
}

function prefixSums(units: readonly Unit[]): number[] {
  const sums = [0];
  for (const u of units) sums.push(sums[sums.length - 1] + u.cents);
  return sums;
}

interface Choice {
  x: number;
  y: number;
  z: number;
  d: number;
}

/** True when `a` is better than `b`: more discount, then more pairs, then smaller x/y. */
function better(a: Choice, b: Choice | null): boolean {
  if (!b) return true;
  if (a.d !== b.d) return a.d > b.d;
  const pa = a.x + a.y + a.z;
  const pb = b.x + b.y + b.z;
  if (pa !== pb) return pa > pb;
  if (a.x !== b.x) return a.x < b.x;
  return a.y < b.y;
}

function chooseCounts(n30: number, n40: number, s30: number[], s40: number[], mode: ComboPricingMode): Choice | null {
  const C = PIZZA_COMBO_PRICES_CENTS;
  const D = (x: number, y: number, z: number) =>
    s30[x + 2 * y] + s40[x + 2 * z] - (C["30+40"] * x + C["30+30"] * y + C["40+40"] * z);

  let best: Choice | null = null;
  const maxX = Math.min(n30, n40);

  if (mode === "fixed") {
    const pairs = Math.floor((n30 + n40) / 2);
    for (let x = 0; x <= maxX; x++) {
      for (let y = 0; x + 2 * y <= n30; y++) {
        const z = pairs - x - y;
        if (z < 0) break;
        if (x + 2 * z > n40) continue;
        const c = { x, y, z, d: D(x, y, z) };
        if (better(c, best)) best = c;
      }
    }
    return best;
  }

  // never_dearer: y and z are independent once x is fixed.
  for (let x = 0; x <= maxX; x++) {
    let by = 0;
    let bestY = -Infinity;
    for (let y = 0; x + 2 * y <= n30; y++) {
      const v = s30[x + 2 * y] - C["30+30"] * y;
      if (v > bestY || (v === bestY && y > by)) {
        bestY = v;
        by = y;
      }
    }
    let bz = 0;
    let bestZ = -Infinity;
    for (let z = 0; x + 2 * z <= n40; z++) {
      const v = s40[x + 2 * z] - C["40+40"] * z;
      if (v > bestZ || (v === bestZ && z > bz)) {
        bestZ = v;
        bz = z;
      }
    }
    const c = { x, y: by, z: bz, d: D(x, by, bz) };
    if (better(c, best)) best = c;
  }
  return best;
}

export function pizzaMathDiscount(
  lines: readonly PizzaMathLine[],
  options: { mode?: ComboPricingMode } = {}
): PizzaMathResult {
  const mode = options.mode ?? COMBO_PRICING_MODE;
  const u30: Unit[] = [];
  const u40: Unit[] = [];
  lines.forEach((line, index) => {
    const size = comboSizeOf(line);
    if (size === null) return;
    const qty = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0;
    const cents = toCents(line.baseUnitEur);
    if (!Number.isFinite(cents) || cents < 0) return;
    const key = line.key ?? `#${index}`;
    for (let i = 0; i < qty; i++) (size === 30 ? u30 : u40).push({ key, cents });
  });

  const order = (a: Unit, b: Unit) => b.cents - a.cents || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  u30.sort(order);
  u40.sort(order);

  const choice = chooseCounts(u30.length, u40.length, prefixSums(u30), prefixSums(u40), mode);
  if (!choice || choice.x + choice.y + choice.z === 0) return EMPTY;

  // Build the pairs from the most expensive units (see the module comment).
  const raw: { sizes: ComboSizes; a: Unit; b: Unit }[] = [];
  for (let i = 0; i < choice.x; i++) raw.push({ sizes: "30+40", a: u30[i], b: u40[i] });
  for (let i = 0; i < choice.y; i++) {
    raw.push({ sizes: "30+30", a: u30[choice.x + 2 * i], b: u30[choice.x + 2 * i + 1] });
  }
  for (let i = 0; i < choice.z; i++) {
    raw.push({ sizes: "40+40", a: u40[choice.x + 2 * i], b: u40[choice.x + 2 * i + 1] });
  }

  const pairs: PizzaComboPair[] = [];
  const lineCents: Record<string, number> = {};
  let regular = 0;
  let combo = 0;
  let discount = 0;
  for (const p of raw) {
    const price = PIZZA_COMBO_PRICES_CENTS[p.sizes];
    const reg = p.a.cents + p.b.cents;
    const d = reg - price;
    // In "never_dearer" a pair that saves nothing is billed at its regular
    // price — it is not a combo for the customer and is not shown as one.
    if (mode === "never_dearer" && d <= 0) continue;
    regular += reg;
    combo += price;
    discount += d;
    // Split the pair's discount by price share; the remainder goes to the
    // dearer unit, so the two shares add up to `d` exactly.
    const shareA = reg === 0 ? 0 : Math.sign(d) * Math.floor((Math.abs(d) * p.a.cents) / reg);
    const shareB = d - shareA;
    lineCents[p.a.key] = (lineCents[p.a.key] ?? 0) + shareA;
    lineCents[p.b.key] = (lineCents[p.b.key] ?? 0) + shareB;
    pairs.push({
      sizes: p.sizes,
      comboEur: price / 100,
      regularEur: reg / 100,
      discountEur: d / 100,
      lineKeys: [p.a.key, p.b.key],
    });
  }
  if (pairs.length === 0) return EMPTY;

  return {
    eligible: true,
    pairs,
    regularEur: regular / 100,
    comboEur: combo / 100,
    discountEur: discount / 100,
    discountCents: discount,
    lineDiscountsEur: Object.fromEntries(Object.entries(lineCents).map(([k, v]) => [k, v / 100])),
  };
}

// ── The combo snapshot stored on the order (Order.offerJson) ────────────────

export interface PizzaComboSnapshot {
  sizes: ComboSizes;
  comboEur: number;
  regularEur: number;
  discountEur: number;
  /** BG names of the two pizzas, with their size ("Маргарита 30 см"). */
  pizzasBg: [string, string];
}

/** Counts identical combos: "2 × 30+40" — for compact summaries. */
export function summariseCombos(
  pairs: readonly Pick<PizzaComboSnapshot, "sizes" | "comboEur">[]
): { sizes: ComboSizes; count: number; comboEur: number }[] {
  const order: ComboSizes[] = ["30+30", "30+40", "40+40"];
  return order
    .map((sizes) => ({
      sizes,
      count: pairs.filter((p) => p.sizes === sizes).length,
      comboEur: PIZZA_MATH_PRICES_EUR[sizes],
    }))
    .filter((s) => s.count > 0);
}

/** "40 + 30 см" — the human form of a pair's sizes (larger size first). */
export function comboSizesLabel(sizes: ComboSizes, unit = "см"): string {
  const [a, b] = sizes.split("+");
  return `${b} + ${a} ${unit}`;
}

function isComboSizes(v: unknown): v is ComboSizes {
  return v === "30+30" || v === "30+40" || v === "40+40";
}

/** Defensive parse of Order.offerJson — never throws, bad entries are dropped. */
export function parseOfferJson(json: string | null | undefined): PizzaComboSnapshot[] {
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: PizzaComboSnapshot[] = [];
  for (const e of data) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const names = r.pizzasBg;
    if (
      !isComboSizes(r.sizes) ||
      typeof r.comboEur !== "number" ||
      typeof r.regularEur !== "number" ||
      typeof r.discountEur !== "number" ||
      !Array.isArray(names) ||
      names.length !== 2 ||
      !names.every((n) => typeof n === "string")
    ) {
      continue;
    }
    out.push({
      sizes: r.sizes,
      comboEur: r.comboEur,
      regularEur: r.regularEur,
      discountEur: r.discountEur,
      pizzasBg: [names[0] as string, names[1] as string],
    });
  }
  return out;
}
