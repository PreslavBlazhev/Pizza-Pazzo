/**
 * Smoke test for the menu data + the checkout price-derivation contract.
 *
 * Reads the DATABASE (the menu's source of truth since 2026-07-18 — see
 * docs/admin-menu-db-plan.md), creates NO orders and writes nothing, so it is
 * safe to run anywhere the DATABASE_URL points at a migrated DB (local dev,
 * Render Shell). It re-implements the exact price-resolution rule from
 * app/actions/checkout.ts (variant price wins over base price; unavailable
 * products are rejected) and fails loudly if the data would break it.
 *
 * The checks are deliberately structural, not exact-price: the admin panel
 * edits prices now, so asserting seed values would fail on the first edit.
 *
 * Usage: npm run smoke   (alias for: node scripts/smoke-checkout.mjs)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EUR_TO_BGN = 1.95583; // fixed conversion rate (lib/constants.ts)
const RATE_TOLERANCE = 0.05; // docx source rounds some prices up ~2.3%

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);
const round2 = (n) => Math.round(n * 100) / 100;

// Load DB rows into the same shape the checkout logic sees.
const categories = await prisma.menuCategory.findMany();
const products = (
  await prisma.menuProduct.findMany({
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  })
).map((p) => ({
  id: p.id,
  slug: p.slug,
  name: { bg: p.nameBg, en: p.nameEn },
  categoryId: p.categoryId,
  priceBgn: Number(p.priceBgn),
  priceEur: Number(p.priceEur),
  isAvailable: p.isAvailable,
  allergensJson: p.allergens,
  variants: p.variants.length
    ? p.variants.map((v) => ({
        id: v.id,
        name: { bg: v.nameBg, en: v.nameEn },
        priceBgn: Number(v.priceBgn),
        priceEur: Number(v.priceEur),
      }))
    : undefined,
}));

if (products.length === 0) {
  console.error(
    "SMOKE FAILED — the menu tables are empty. Run: node scripts/import-menu-to-db.mjs"
  );
  process.exit(1);
}

// ── 1. Structural integrity ────────────────────────────────────────────────
console.log("1) Menu data integrity (database)");

const ids = new Set();
const slugs = new Set();
const categoryIds = new Set(categories.map((c) => c.id));

for (const p of products) {
  if (ids.has(p.id)) fail(`duplicate product id: ${p.id}`);
  if (slugs.has(p.slug)) fail(`duplicate slug: ${p.slug}`);
  ids.add(p.id);
  slugs.add(p.slug);

  if (!p.name.bg) fail(`${p.slug}: missing BG name`);
  if (!categoryIds.has(p.categoryId)) fail(`${p.slug}: unknown category ${p.categoryId}`);

  try {
    const allergens = JSON.parse(p.allergensJson);
    if (!Array.isArray(allergens)) fail(`${p.slug}: allergens is not an array`);
  } catch {
    fail(`${p.slug}: allergens JSON does not parse`);
  }

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
      if (!v.name.bg) fail(`${p.slug}/${v.id}: missing variant BG name`);
    }
  }
}
if (failures === 0)
  ok(`${products.length} products, ${categories.length} categories, ids/slugs unique, prices sane`);

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

// Multi-variant products must resolve EACH variant to that variant's own
// price — the "two sizes, one price" bug class from the docx import.
let variantChecks = 0;
for (const p of products.filter((x) => x.isAvailable && (x.variants?.length ?? 0) >= 2)) {
  for (const v of p.variants) {
    const r = derivePrice(p.id, v.id);
    if (r.error) fail(`${p.slug}/${v.id}: ${r.error}`);
    else if (r.unitBgn !== v.priceBgn || r.unitEur !== v.priceEur) {
      fail(`${p.slug}/${v.id}: derived ${r.unitBgn}/${r.unitEur}, stored ${v.priceBgn}/${v.priceEur}`);
    } else {
      variantChecks++;
    }
  }
  const [a, b] = p.variants;
  if (a.priceBgn === b.priceBgn && a.priceEur === b.priceEur) {
    console.warn(`  ⚠ ${p.slug}: first two variants have identical prices — check the data`);
  }
}
ok(`variant prices resolve exactly (${variantChecks} variants)`);

// A bogus variant id must be rejected, not silently fall back to base price.
const anyProduct = products.find((p) => p.isAvailable);
if (!derivePrice(anyProduct.id, "var_no_such").error) {
  fail("bogus variant id was accepted — checkout would mischarge");
} else {
  ok("bogus variant id is rejected");
}

// ── 3. Line/total arithmetic (round2, same as checkout) ────────────────────
console.log("3) Totals arithmetic");
const sample = products
  .filter((p) => p.isAvailable)
  .slice(0, 2)
  .map((p, i) => ({ ...derivePrice(p.id, p.variants?.[0]?.id), qty: i + 2, slug: p.slug }));
let subBgn = 0;
let subEur = 0;
let expectBgn = 0;
let expectEur = 0;
for (const l of sample) {
  subBgn = round2(subBgn + round2(l.unitBgn * l.qty));
  subEur = round2(subEur + round2(l.unitEur * l.qty));
  expectBgn += Math.round(l.unitBgn * 100) * l.qty;
  expectEur += Math.round(l.unitEur * 100) * l.qty;
}
if (Math.round(subBgn * 100) !== expectBgn || Math.round(subEur * 100) !== expectEur) {
  fail(`sample cart totals drift: got ${subBgn} лв. / ${subEur} € (integer check ${expectBgn}/${expectEur} stotinki)`);
} else {
  ok(`sample cart (${sample.map((l) => `${l.qty}× ${l.slug}`).join(" + ")}) = ${subEur} € / ${subBgn} лв., no rounding drift`);
}

// ── Result ────────────────────────────────────────────────────────────────
await prisma.$disconnect();
if (failures > 0) {
  console.error(`\nSMOKE FAILED — ${failures} problem(s).`);
  process.exit(1);
}
console.log("\nSMOKE OK");
