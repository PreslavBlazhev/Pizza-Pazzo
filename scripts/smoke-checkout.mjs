/**
 * Smoke test for the menu data + the checkout price-derivation contract.
 *
 * Pure data checks — reads data/*.json, touches NO database and creates NO
 * orders, so it is safe to run anywhere (dev, CI, production build step).
 * It re-implements the exact price-resolution rule from
 * app/actions/checkout.ts (variant price wins over base price; unavailable
 * products are rejected) and fails loudly if the data would break it.
 *
 * Usage: npm run smoke   (alias for: node scripts/smoke-checkout.mjs)
 */
import { readFileSync } from "node:fs";

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), "utf8"));
const products = load("pizza-pazzo-menu.json");
const categories = load("categories.json");

const EUR_TO_BGN = 1.95583; // fixed conversion rate (lib/constants.ts)
const RATE_TOLERANCE = 0.05; // docx source rounds some prices up ~2.3%

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ── 1. Structural integrity ────────────────────────────────────────────────
console.log("1) Menu data integrity");

const ids = new Set();
const slugs = new Set();
const categoryIds = new Set(categories.map((c) => c.id));

for (const p of products) {
  if (ids.has(p.id)) fail(`duplicate product id: ${p.id}`);
  if (slugs.has(p.slug)) fail(`duplicate slug: ${p.slug}`);
  ids.add(p.id);
  slugs.add(p.slug);

  if (!p.name?.bg) fail(`${p.slug}: missing BG name`);
  if (!p.name?.en) fail(`${p.slug}: missing EN name`);
  if (!categoryIds.has(p.categoryId)) fail(`${p.slug}: unknown category ${p.categoryId}`);

  const pricePoints = p.variants?.length ? p.variants : [p];
  for (const v of pricePoints) {
    const label = v === p ? p.slug : `${p.slug}/${v.id}`;
    if (!(v.priceBgn > 0) || !(v.priceEur > 0)) fail(`${label}: non-positive price`);
    const ratio = v.priceBgn / v.priceEur;
    if (Math.abs(ratio - EUR_TO_BGN) / EUR_TO_BGN > RATE_TOLERANCE) {
      fail(`${label}: BGN/EUR ratio ${ratio.toFixed(3)} looks swapped or wrong`);
    }
  }

  if (p.variants) {
    const vIds = new Set();
    for (const v of p.variants) {
      if (vIds.has(v.id)) fail(`${p.slug}: duplicate variant id ${v.id}`);
      vIds.add(v.id);
      if (!v.name?.bg || !v.name?.en) fail(`${p.slug}/${v.id}: missing variant name translation`);
    }
  }
}
if (failures === 0) ok(`${products.length} products, ${categories.length} categories, ids/slugs unique, prices sane`);

// ── 2. Checkout price derivation (same rule as app/actions/checkout.ts) ───
console.log("2) Checkout price derivation");

/** Mirrors the server action: base price unless a variant is requested. */
function derivePrice(productId, variantId) {
  const p = products.find((x) => x.id === productId);
  if (!p || !p.isAvailable) return { error: "unavailable" };
  if (variantId) {
    const v = p.variants?.find((x) => x.id === variantId);
    if (!v) return { error: "bad-variant" };
    return { unitBgn: v.priceBgn, unitEur: v.priceEur };
  }
  return { unitBgn: p.priceBgn, unitEur: p.priceEur };
}

// Every product must be resolvable the way the cart sends it: with its first
// variant when it has variants, without one otherwise.
let resolved = 0;
for (const p of products) {
  const r = derivePrice(p.id, p.variants?.[0]?.id);
  if (r.error && p.isAvailable) fail(`${p.slug}: cannot derive price (${r.error})`);
  else if (!r.error) resolved++;
}
ok(`price derivable for ${resolved} products`);

// The three merged products must resolve BOTH variants to their exact prices.
const expectations = [
  ["prod_coca_cola", "var_coca_cola_1", 3.5, 1.79],
  ["prod_coca_cola", "var_coca_cola_2", 4.5, 2.3],
  ["prod_mineralna_voda_bankya", "var_mineralna_voda_bankya_1", 2, 1.02],
  ["prod_mineralna_voda_bankya", "var_mineralna_voda_bankya_2", 2.99, 1.53],
  ["prod_pikantni_kartofi", "var_pikantni_kartofi_1", 5, 2.56],
  ["prod_pikantni_kartofi", "var_pikantni_kartofi_2", 8.5, 4.35],
  ["prod_margarita", "var_margarita_2", 19.95, 10.23],
];
for (const [pid, vid, bgn, eur] of expectations) {
  const r = derivePrice(pid, vid);
  if (r.error) fail(`${pid}/${vid}: ${r.error}`);
  else if (r.unitBgn !== bgn || r.unitEur !== eur) {
    fail(`${pid}/${vid}: expected ${bgn} лв./${eur} €, got ${r.unitBgn}/${r.unitEur}`);
  }
}
ok("merged-product variants resolve to their exact prices");

// A bogus variant id must be rejected, not silently fall back to base price.
if (!derivePrice("prod_margarita", "var_no_such").error) {
  fail("bogus variant id was accepted — checkout would mischarge");
} else {
  ok("bogus variant id is rejected");
}

// ── 3. Line/total arithmetic (round2, same as checkout) ────────────────────
console.log("3) Totals arithmetic");
const round2 = (n) => Math.round(n * 100) / 100;
const cart = [
  { ...derivePrice("prod_margarita", "var_margarita_1"), qty: 2 },
  { ...derivePrice("prod_coca_cola", "var_coca_cola_2"), qty: 1 },
];
let subBgn = 0;
let subEur = 0;
for (const l of cart) {
  subBgn = round2(subBgn + round2(l.unitBgn * l.qty));
  subEur = round2(subEur + round2(l.unitEur * l.qty));
}
if (subBgn !== 30.52 || subEur !== 15.6) {
  fail(`sample cart totals wrong: got ${subBgn} лв. / ${subEur} € (expected 30.52 / 15.60)`);
} else {
  ok(`sample cart: 2× Маргарита 30см + 1× Coca-Cola 1л = ${subEur} € / ${subBgn} лв.`);
}

// ── Result ────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\nSMOKE FAILED — ${failures} problem(s).`);
  process.exit(1);
}
console.log("\nSMOKE OK");
