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
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

// ── 4. Extras resolution & pricing (lib/extras-rules + lib/extras-resolve) ──
//
// The two extras modules are dependency-free TypeScript by design, so this
// script compiles them standalone into a temp dir and unit-tests the REAL
// resolver — no re-implementation drift. Pure functions + read-only menu data;
// nothing is written to the database.
console.log("4) Extras resolution & pricing");

const buildDir = mkdtempSync(join(tmpdir(), "pp-extras-smoke-"));
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Compiles the order-facing modules into the temp dir and returns `require`d
 * handles to them. They are all free of Next.js/React runtime imports, so they
 * run under plain Node — but they DO use the "@/..." alias, hence a generated
 * tsconfig rather than a bare `tsc file.ts` invocation.
 */
let mods = null;
try {
  const entryPoints = [
    "lib/extras-rules.ts",
    "lib/extras-resolve.ts",
    "lib/order-extras-display.ts",
    "lib/email-templates/new-order.ts",
    "lib/email-templates/customer-order-accepted.ts",
    "lib/printer/ticket-template.ts",
    "lib/android-printer.ts",
  ];
  const tsconfigPath = join(buildDir, "tsconfig.smoke.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        target: "es2020",
        module: "commonjs",
        moduleResolution: "node",
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        baseUrl: projectRoot,
        paths: { "@/*": ["./*"] },
        rootDir: projectRoot,
        outDir: join(buildDir, "out"),
        // Node only: lib/constants.ts reads process.env; nothing here needs
        // the DOM or React type packages. typeRoots must be absolute — the
        // generated tsconfig lives in a temp dir, far from node_modules.
        types: ["node"],
        typeRoots: [join(projectRoot, "node_modules", "@types")],
      },
      files: entryPoints.map((f) => join(projectRoot, f)),
    })
  );
  execSync(`npx tsc -p "${tsconfigPath}"`, { stdio: "pipe" });

  // tsc resolves "@/..." for type-checking but emits it verbatim, so teach
  // Node's CJS loader the same alias, pointed at the compiled output.
  const outRoot = join(buildDir, "out");
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    const target = request.startsWith("@/") ? join(outRoot, request.slice(2)) : request;
    return resolveFilename.call(this, target, ...args);
  };

  const requireCjs = createRequire(import.meta.url);
  const load = (rel) => requireCjs(join(outRoot, rel));
  mods = {
    rules: load("lib/extras-rules.js"),
    resolve: load("lib/extras-resolve.js"),
    display: load("lib/order-extras-display.js"),
    newOrderEmail: load("lib/email-templates/new-order.js"),
    acceptedEmail: load("lib/email-templates/customer-order-accepted.js"),
    ticket: load("lib/printer/ticket-template.js"),
    android: load("lib/android-printer.js"),
  };
} catch (e) {
  const detail = e.stdout ? e.stdout.toString().slice(0, 1500) : e.message;
  fail(`order modules failed to compile standalone:\n${detail}`);
}

const rules = mods?.rules;
const resolveOrderItemExtras = mods?.resolve?.resolveOrderItemExtras;

if (rules && resolveOrderItemExtras) {
  // DB rows → the resolver's ExtraSourceProduct shape.
  const srcShape = (p) => ({
    id: p.id,
    categoryId: p.categoryId,
    isAvailable: p.isAvailable,
    nameBg: p.name.bg,
    nameEn: p.name.en,
    priceEur: p.priceEur,
    priceBgn: p.priceBgn,
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      nameBg: v.name.bg,
      nameEn: v.name.en,
      priceEur: v.priceEur,
      priceBgn: v.priceBgn,
    })),
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const firstOf = (categoryId) =>
    products.find((p) => p.categoryId === categoryId && p.isAvailable);

  const pizza = products.find(
    (p) =>
      rules.PIZZA_CATEGORY_IDS.includes(p.categoryId) &&
      p.isAvailable &&
      (p.variants?.length ?? 0) >= 2
  );
  const burger = firstOf(rules.BURGER_CATEGORY_ID);
  const drink = firstOf("cat_drinks");
  const dessert = firstOf("cat_desserts");
  const crustProduct = byId.get(rules.PIZZA_CRUST_SOURCE_PRODUCT_ID);
  const genericAddon = byId.get(rules.PIZZA_GENERIC_ADDON_SOURCE_PRODUCT_ID);
  const vegetableAddon = byId.get(rules.PIZZA_VEGETABLE_ADDON_SOURCE_PRODUCT_ID);
  const sauce = firstOf(rules.SAUCES_CATEGORY_ID);
  const burgerAddon = firstOf(rules.BURGER_ADDONS_CATEGORY_ID);

  if (!pizza || !burger || !drink || !dessert || !crustProduct || !genericAddon || !vegetableAddon || !sauce || !burgerAddon) {
    fail("extras smoke: required test products are missing from the menu data");
  } else {
    const sources = new Map(
      [crustProduct, genericAddon, vegetableAddon, sauce, burgerAddon].map((p) => [
        p.id,
        srcShape(p),
      ])
    );
    const sizeOf = (v) => rules.parseVariantSize(v.name.bg);
    const pizza30 = pizza.variants.find((v) => sizeOf(v) === 30);
    const pizza40 = pizza.variants.find((v) => sizeOf(v) === 40);
    const crust30 = crustProduct.variants.find((v) => sizeOf(v) === 30);
    const crust40 = crustProduct.variants.find((v) => sizeOf(v) === 40);
    const veg30 = vegetableAddon.variants.find((v) => sizeOf(v) === 30);
    const generic30 = genericAddon.variants.find((v) => sizeOf(v) === 30);

    const resolveFor = (main, variantName, selections) =>
      resolveOrderItemExtras({
        mainProduct: { id: main.id, categoryId: main.categoryId },
        mainVariantName: variantName,
        selections,
        sourceProducts: sources,
      });
    const sel = (key, sourceProductId, quantity = 1) => ({ key, sourceProductId, quantity });
    const crustSel = (key = "cheese_crust") => sel(key, crustProduct.id);
    const expectOk = (label, r, checkFn) => {
      if (!r.ok) return fail(`${label}: rejected (${r.code})`);
      const problem = checkFn ? checkFn(r) : null;
      if (problem) return fail(`${label}: ${problem}`);
      ok(label);
    };
    const expectFail = (label, r, code) => {
      if (r.ok) return fail(`${label}: was ACCEPTED — must be rejected`);
      if (code && r.code !== code) return fail(`${label}: rejected with '${r.code}', expected '${code}'`);
      ok(`${label} (${r.code})`);
    };

    if (!pizza30 || !pizza40 || !crust30 || !crust40 || !veg30 || !generic30) {
      fail("extras smoke: 30/40 см variants not found on pizza/addon products");
    } else {
      // 1) Pizza 30 см + cheese crust → the crust's 30 см variant + price.
      expectOk("pizza 30 см + cheese_crust uses the 30 см addon variant", resolveFor(pizza, pizza30.name.bg, [crustSel()]), (r) => {
        const e = r.extras[0];
        if (r.extras.length !== 1) return `expected 1 extra, got ${r.extras.length}`;
        if (e.sourceVariantId !== crust30.id) return `matched variant ${e.sourceVariantId}, expected ${crust30.id}`;
        if (e.unitPriceEur !== crust30.priceEur || e.unitPriceBgn !== crust30.priceBgn) return "crust 30 price mismatch";
        if (e.nameBg !== "Кашкавален борд" || e.nameEn !== "Cheese crust") return "snapshot label wrong";
        if (r.extrasUnitTotalEur !== round2(crust30.priceEur)) return "unit total wrong";
        return null;
      });

      // 2) Pizza 40 см + cheese crust → the 40 см variant.
      expectOk("pizza 40 см + cheese_crust uses the 40 см addon variant", resolveFor(pizza, pizza40.name.bg, [crustSel()]), (r) => {
        const e = r.extras[0];
        if (e.sourceVariantId !== crust40.id) return `matched ${e.sourceVariantId}, expected ${crust40.id}`;
        if (e.unitPriceEur !== crust40.priceEur) return "crust 40 price mismatch";
        if (e.sizeContext !== crust40.name.bg) return `sizeContext '${e.sizeContext}'`;
        return null;
      });

      // 3) Pizza 30 см + meat + vegetable addons.
      expectOk("pizza 30 см + meat_addon + vegetable_addon", resolveFor(pizza, pizza30.name.bg, [sel("meat_addon", genericAddon.id), sel("vegetable_addon", vegetableAddon.id)]), (r) => {
        if (r.extras.length !== 2) return `expected 2 extras, got ${r.extras.length}`;
        const meat = r.extras.find((e) => e.key === "meat_addon");
        const veg = r.extras.find((e) => e.key === "vegetable_addon");
        if (!meat || meat.unitPriceEur !== generic30.priceEur) return "meat addon 30 price mismatch";
        if (!veg || veg.unitPriceEur !== veg30.priceEur) return "vegetable addon 30 price mismatch";
        if (meat.nameBg !== "Месна добавка" || veg.nameBg !== "Зеленчукова добавка") return "labels wrong";
        if (r.extrasUnitTotalEur !== round2(round2(generic30.priceEur) + veg30.priceEur)) return "unit total wrong";
        return null;
      });

      // 4) Sauce quantity 2 → unit × 2.
      expectOk("pizza + sauce ×2 totals unit × 2", resolveFor(pizza, pizza30.name.bg, [sel(`sauce:${sauce.id}`, sauce.id, 2)]), (r) => {
        const e = r.extras[0];
        if (e.quantity !== 2) return `quantity ${e.quantity}`;
        if (e.totalPriceEur !== round2(sauce.priceEur * 2)) return "sauce total mismatch";
        if (e.totalPriceBgn !== round2(sauce.priceBgn * 2)) return "sauce BGN total mismatch";
        return null;
      });

      // 5) Main quantity 2 — the checkout line-total formula multiplies the
      //    per-unit extras (documented semantics: extras apply to every unit).
      {
        const r = resolveFor(pizza, pizza30.name.bg, [sel(`sauce:${sauce.id}`, sauce.id, 2)]);
        if (!r.ok) fail("line total with main qty 2: resolver rejected");
        else {
          const mainQty = 2;
          const perUnit = round2(pizza30.priceEur + r.extrasUnitTotalEur);
          const line = round2(perUnit * mainQty);
          const expectedCents =
            (Math.round(pizza30.priceEur * 100) + Math.round(sauce.priceEur * 100) * 2) * mainQty;
          if (Math.round(line * 100) !== expectedCents) {
            fail(`line total drift: ${line} € vs ${expectedCents} cents`);
          } else {
            ok(`main qty 2 line total = (base + extras) × 2 = ${line} € (no drift)`);
          }
        }
      }

      // 6) Same extras, different click order → identical lineId.
      {
        const a = [crustSel(), sel(`sauce:${sauce.id}`, sauce.id, 2), sel("meat_addon", genericAddon.id)];
        const b = [sel("meat_addon", genericAddon.id), crustSel(), sel(`sauce:${sauce.id}`, sauce.id, 2)];
        const idA = rules.lineIdFor(pizza.id, pizza30.id, a);
        const idB = rules.lineIdFor(pizza.id, pizza30.id, b);
        if (idA !== idB) fail("lineId differs for the same extras in different order");
        else ok("lineId is order-independent for identical extras");
      }

      // 7) Different crust → different lineId.  8) Sauce qty 1 vs 2 → different.
      if (rules.lineIdFor(pizza.id, pizza30.id, [crustSel("cheese_crust")]) === rules.lineIdFor(pizza.id, pizza30.id, [crustSel("pepperoni_crust")])) {
        fail("different crusts produced the same lineId");
      } else ok("different crusts produce different lineIds");
      if (rules.lineIdFor(pizza.id, pizza30.id, [sel(`sauce:${sauce.id}`, sauce.id, 1)]) === rules.lineIdFor(pizza.id, pizza30.id, [sel(`sauce:${sauce.id}`, sauce.id, 2)])) {
        fail("sauce qty 1 and 2 merged into the same lineId");
      } else ok("sauce quantity is part of the lineId");
      if (rules.lineIdFor(pizza.id, pizza30.id, []) !== `${pizza.id}::${pizza30.id}`) {
        fail("legacy lineId format changed for items without extras");
      } else ok("no-extras lineId keeps the legacy format");

      // 9) Fake source product id → rejected.
      expectFail("fake sourceProductId", resolveFor(pizza, pizza30.name.bg, [sel("sauce:prod_no_such", "prod_no_such", 1)]), "unknown-product");

      // 10) Real product, wrong source category (a burger addon posing as sauce).
      expectFail("sauce key pointing at a burger-addon product", resolveFor(pizza, pizza30.name.bg, [sel(`sauce:${burgerAddon.id}`, burgerAddon.id, 1)]), "wrong-category");

      // 11) Burger addon on a pizza → rejected.
      expectFail("burger addon on a pizza", resolveFor(pizza, pizza30.name.bg, [sel(`burger_addon:${burgerAddon.id}`, burgerAddon.id, 1)]), "not-allowed-for-product");

      // 12) Pizza addon on a burger → rejected.
      expectFail("pizza addon on a burger", resolveFor(burger, undefined, [sel("meat_addon", genericAddon.id)]), "not-allowed-for-product");
      expectFail("crust on a burger", resolveFor(burger, undefined, [crustSel()]), "not-allowed-for-product");

      // 13) Sauce on a drink / dessert → rejected (deny list).
      expectFail("sauce on a drink", resolveFor(drink, undefined, [sel(`sauce:${sauce.id}`, sauce.id, 1)]), "not-allowed-for-product");
      expectFail("sauce on a dessert", resolveFor(dessert, undefined, [sel(`sauce:${sauce.id}`, sauce.id, 1)]), "not-allowed-for-product");

      // 14) More than one crust → rejected; duplicate same crust too.
      expectFail("two different crusts", resolveFor(pizza, pizza30.name.bg, [crustSel("cheese_crust"), crustSel("pepperoni_crust")]), "multiple-crusts");
      expectFail("the same crust twice", resolveFor(pizza, pizza30.name.bg, [crustSel(), crustSel()]), "duplicate-selection");
      expectFail("crust key with mismatched sourceProductId", resolveFor(pizza, pizza30.name.bg, [sel("cheese_crust", sauce.id)]), "key-product-mismatch");

      // 15) Size cannot be determined / addon has no matching size variant.
      expectFail("main variant without a parsable size", resolveFor(pizza, "Фамилна", [crustSel()]), "no-main-size");
      expectFail("no addon variant for size 50", resolveFor(pizza, "50 см", [crustSel()]), "no-size-variant");
      expectFail("variant-based addon without a main variant", resolveFor(pizza, undefined, [crustSel()]), "no-main-size");

      // 16) Sauce quantity over the cap — direct and via duplicate merging.
      expectFail("sauce quantity 11", resolveFor(pizza, pizza30.name.bg, [sel(`sauce:${sauce.id}`, sauce.id, 11)]), "sauce-quantity");
      expectFail("duplicate sauces merging to 12", resolveFor(pizza, pizza30.name.bg, [sel(`sauce:${sauce.id}`, sauce.id, 6), sel(`sauce:${sauce.id}`, sauce.id, 6)]), "sauce-quantity");
      expectOk("duplicate sauces merging to 4 are combined into one entry", resolveFor(pizza, pizza30.name.bg, [sel(`sauce:${sauce.id}`, sauce.id, 1), sel(`sauce:${sauce.id}`, sauce.id, 3)]), (r) => {
        if (r.extras.length !== 1) return `expected 1 merged entry, got ${r.extras.length}`;
        if (r.extras[0].quantity !== 4) return `merged quantity ${r.extras[0].quantity}, expected 4`;
        return null;
      });

      // 17) More than 15 extras entries → rejected.
      expectFail("16 extras entries", resolveFor(pizza, pizza30.name.bg, Array.from({ length: 16 }, () => sel(`sauce:${sauce.id}`, sauce.id, 1))), "too-many-extras");

      // Unknown key + burger addon happy path.
      expectFail("unknown selection key", resolveFor(pizza, pizza30.name.bg, [sel("golden_truffle", crustProduct.id)]), "unknown-key");
      expectOk("burger + burger addon uses the addon's base price", resolveFor(burger, undefined, [sel(`burger_addon:${burgerAddon.id}`, burgerAddon.id, 1)]), (r) => {
        const e = r.extras[0];
        if (e.unitPriceEur !== burgerAddon.priceEur) return "price mismatch";
        if (e.nameBg !== burgerAddon.name.bg) return "snapshot name should come from the product";
        return null;
      });
    }
  }

  // ── 5. extrasJson snapshot parsing (order mapper contract) ──
  console.log("5) extrasJson parsing (mapper contract)");
  {
    const p = rules.parseOrderItemExtras;
    const validExtra = {
      key: "sauce:prod_ketchup",
      sourceProductId: "prod_ketchup",
      type: "sauce",
      nameBg: "Кетчуп",
      nameEn: "Ketchup",
      quantity: 2,
      unitPriceEur: 1.02,
      unitPriceBgn: 2,
      totalPriceEur: 2.04,
      totalPriceBgn: 4,
    };
    const checks = [
      [p("[]").length === 0, 'legacy "[]" → []'],
      [p("").length === 0 && p(null).length === 0 && p(undefined).length === 0, "empty/null/undefined → []"],
      [p("{ broken json").length === 0, "invalid JSON → [] (no throw)"],
      [p('{"a":1}').length === 0, "non-array JSON → []"],
      [p(JSON.stringify([validExtra])).length === 1, "valid snapshot entry parses"],
      [p(JSON.stringify([validExtra, { garbage: true }, 42])).length === 1, "malformed entries are dropped, valid ones kept"],
      [p(JSON.stringify([{ ...validExtra, quantity: -1 }])).length === 0, "negative quantity entry dropped"],
      [p(JSON.stringify([{ ...validExtra, unitPriceEur: "1.02" }])).length === 0, "string price entry dropped"],
    ];
    for (const [passed, label] of checks) {
      if (passed) ok(label);
      else fail(`extrasJson parsing: ${label}`);
    }
  }
}

// ── 6-9. Order display surfaces (admin/emails/ticket/Android) ──────────────
//
// Everything below renders from an immutable OrderItem.extras snapshot — the
// same shape lib/orders.ts produces. No database reads, no emails sent.
if (mods) {
  const {
    display,
    newOrderEmail: { newOrderEmail },
    acceptedEmail: { customerOrderAcceptedEmail },
    ticket: { buildTicketText },
    android: { buildPrintableOrderJson },
  } = mods;

  /** Snapshot fixtures mirroring what checkout writes. */
  const crust = {
    key: "cheese_crust",
    sourceProductId: "prod_kashkavalen_filadelfiya_krenvirsh_peperoni_bord",
    sourceVariantId: "var_kashkavalen_filadelfiya_krenvirsh_peperoni_bord_1",
    type: "pizza_crust",
    nameBg: "Кашкавален борд",
    nameEn: "Cheese crust",
    quantity: 1,
    sizeContext: "30 см",
    unitPriceEur: 3.58,
    unitPriceBgn: 7,
    totalPriceEur: 3.58,
    totalPriceBgn: 7,
  };
  const sauceX2 = {
    key: "sauce:prod_chesnov_sos",
    sourceProductId: "prod_chesnov_sos",
    type: "sauce",
    nameBg: "Чеснов сос",
    nameEn: "Garlic sauce",
    quantity: 2,
    unitPriceEur: 1.02,
    unitPriceBgn: 2,
    totalPriceEur: 2.04,
    totalPriceBgn: 4,
  };
  const item = (over = {}) => ({
    id: "oi_1",
    orderId: "o_1",
    productId: "prod_margarita",
    productSlug: "margarita",
    productNameBg: "Маргарита",
    productNameEn: "Margherita",
    productImageUrl: null,
    variantId: "var_margarita_1",
    variantName: "30 см / 30 cm",
    quantity: 1,
    unitPriceBgn: 13.01,
    unitPriceEur: 6.65,
    totalPriceBgn: 20.01,
    totalPriceEur: 10.23,
    extras: [],
    itemNote: null,
    ...over,
  });
  const order = (items) => ({
    id: "o_1",
    orderNumber: 1234,
    userId: null,
    customerName: "Иван Петров",
    customerEmail: "ivan@example.com",
    customerPhone: "0888123456",
    deliveryAddress: "ул. Тестова 1",
    deliveryCity: "Плевен",
    deliveryNote: null,
    paymentMethod: "CASH_ON_DELIVERY",
    deliveryMethod: "DELIVERY",
    status: "ACCEPTED",
    subtotalBgn: 20.01,
    subtotalEur: 10.23,
    deliveryFeeBgn: 4.89,
    deliveryFeeEur: 2.5,
    totalBgn: 24.9,
    totalEur: 12.73,
    estimatedTimeMinutes: 30,
    adminNote: null,
    acceptedAt: "2026-07-26T10:00:00.000Z",
    cancelledAt: null,
    completedAt: null,
    createdAt: "2026-07-26T09:50:00.000Z",
    updatedAt: "2026-07-26T10:00:00.000Z",
    items,
  });

  const check = (label, condition) => (condition ? ok(label) : fail(label));

  // ── 6. Display formatter ──
  console.log("6) Extras display formatter");
  {
    const [bg] = display.toOrderExtrasDisplay([crust], "bg");
    const [en] = display.toOrderExtrasDisplay([crust], "en");
    check("BG locale uses nameBg", bg.name === "Кашкавален борд");
    check("EN locale uses nameEn", en.name === "Cheese crust");
    check("sizeContext is carried through", bg.sizeContext === "30 см");
    check("prices are carried through", bg.totalPriceEur === 3.58 && bg.totalPriceBgn === 7);
    check(
      "internal identifiers are not exposed",
      !("key" in bg) && !("sourceProductId" in bg) && !("sourceVariantId" in bg)
    );
    const [noEn] = display.toOrderExtrasDisplay([{ ...crust, nameEn: "" }], "en");
    check("EN falls back to BG when missing", noEn.name === "Кашкавален борд");
    const [noBg] = display.toOrderExtrasDisplay([{ ...crust, nameBg: "" }], "bg");
    check("BG falls back to EN when missing", noBg.name === "Cheese crust");
    check("empty/missing extras → []", display.toOrderExtrasDisplay([], "bg").length === 0 && display.toOrderExtrasDisplay(undefined, "bg").length === 0);
    const [s2] = display.toOrderExtrasDisplay([sauceX2], "bg");
    check("quantity >1 is prefixed", display.extraLabel(s2) === "2× Чеснов сос");
    check("quantity 1 has no prefix", display.extraLabel(bg) === "Кашкавален борд");
    check(
      "per-unit hint only for multi-quantity lines",
      display.extraKitchenLabel(s2, 2) === "2x Чеснов сос / всяка" &&
        display.extraKitchenLabel(s2, 1) === "2x Чеснов сос"
    );
  }

  // ── 7. Emails ──
  console.log("7) Order emails with extras");
  {
    const withExtras = newOrderEmail({
      orderNumber: 1234,
      customerName: "Иван",
      customerPhone: "0888",
      customerEmail: "i@e.com",
      deliveryCity: "Плевен",
      deliveryAddress: "ул. Тестова 1",
      totalBgn: 24.9,
      totalEur: 12.73,
      items: [
        { nameBg: "Маргарита", variantName: "30 см", quantity: 2, totalPriceBgn: 53.6, totalPriceEur: 27.64, extras: [crust, sauceX2] },
      ],
    });
    check("new-order text lists the crust", withExtras.text.includes("+ Кашкавален борд / всяка"));
    check("new-order text lists the sauce with quantity", withExtras.text.includes("+ 2x Чеснов сос / всяка"));
    check("new-order HTML lists the extras", withExtras.html.includes("Кашкавален борд / всяка") && withExtras.html.includes("2x Чеснов сос / всяка"));
    check("new-order HTML keeps the line total", withExtras.html.includes("27.64 €"));
    check("new-order leaks no internal keys", !withExtras.text.includes("cheese_crust") && !withExtras.html.includes("prod_chesnov_sos"));

    const noExtras = newOrderEmail({
      orderNumber: 1235,
      customerName: "Иван",
      customerPhone: "0888",
      customerEmail: "",
      deliveryCity: "Плевен",
      deliveryAddress: "ул. Тестова 1",
      totalBgn: 20.01,
      totalEur: 10.23,
      items: [{ nameBg: "Маргарита", variantName: null, quantity: 1, totalPriceBgn: 20.01, totalPriceEur: 10.23 }],
    });
    check("new-order without extras still renders (legacy item)", noExtras.text.includes("1× Маргарита") && !noExtras.text.includes("+ "));

    const accepted = customerOrderAcceptedEmail(
      order([item({ quantity: 2, totalPriceEur: 27.64, totalPriceBgn: 53.6, extras: [crust, sauceX2] })])
    );
    check("accepted text lists extras with prices", accepted.text.includes("+ Кашкавален борд (за всяка бройка) — 3.58 €") && accepted.text.includes("+ 2× Чеснов сос (за всяка бройка) — 2.04 €"));
    check("accepted HTML lists extras", accepted.html.includes("Кашкавален борд") && accepted.html.includes("2× Чеснов сос"));
    const acceptedPlain = customerOrderAcceptedEmail(order([item()]));
    check("accepted without extras still renders", acceptedPlain.text.includes("1 × Маргарита") && !acceptedPlain.text.includes("+ "));
    check("accepted single unit omits the per-item hint", customerOrderAcceptedEmail(order([item({ extras: [sauceX2] })])).text.includes("+ 2× Чеснов сос — "));
  }

  // ── 8. Web ticket ──
  console.log("8) Web ticket with extras");
  {
    const width = 42; // PRINT_CONFIG.charsPerLine
    const t1 = buildTicketText(order([item({ extras: [crust] })]));
    check("ticket prints the size line", t1.includes("Размер: 30 см / 30 cm"));
    check("ticket prints the crust", t1.includes("+ Кашкавален борд"));
    check("ticket keeps the line total", t1.includes("10.23 €"));

    const t2 = buildTicketText(order([item({ quantity: 2, totalPriceEur: 27.64, extras: [crust, sauceX2] })]));
    check("ticket marks extras as per-unit on multi-quantity lines", t2.includes("+ 2x Чеснов сос / всяка"));
    check("ticket shows the main quantity", t2.includes("2x Маргарита"));

    const t3 = buildTicketText(order([item()]));
    check("ticket without extras prints no + lines", !t3.split("\n").some((l) => l.trim().startsWith("+ ")));

    const longName = "Кашкавален борд с допълнително синьо сирене и печени чушки";
    const t4 = buildTicketText(order([item({ extras: [{ ...crust, nameBg: longName }] })]));
    const overLong = t4.split("\n").filter((l) => l.length > width);
    check(`ticket wraps long extra names within ${width} chars`, overLong.length === 0);
    check("ticket loses no characters when wrapping", t4.replace(/\s+/g, "").includes(longName.replace(/\s+/g, "")));

    const t5 = buildTicketText(order([item({ extras: [{ ...sauceX2, quantity: 10, totalPriceEur: 10.2, totalPriceBgn: 20 }] })]));
    check("ticket handles sauce quantity 10", t5.includes("+ 10x Чеснов сос"));
  }

  // ── 9. Android adapter serialization ──
  console.log("9) Android printer adapter");
  {
    const json = JSON.parse(
      buildPrintableOrderJson(order([
        item({ quantity: 2, totalPriceEur: 27.64, extras: [crust, sauceX2] }),
        item({ id: "oi_2", productNameBg: "Кока-Кола", variantId: null, variantName: null, extras: [] }),
      ]))
    );
    const [pizza, cola] = json.items;
    check("extras array is present on the item", Array.isArray(pizza.extras) && pizza.extras.length === 2);
    check("extra name carries the per-unit hint", pizza.extras[0].name === "Кашкавален борд / всяка");
    check("extra quantity stays its own field", pizza.extras[1].quantity === 2 && !pizza.extras[1].name.startsWith("2"));
    check("extra price is the per-unit total", pizza.extras[1].price === 2.04);
    check("item without extras serializes to []", Array.isArray(cola.extras) && cola.extras.length === 0);
    check(
      "no internal identifiers are sent",
      !JSON.stringify(json).includes("cheese_crust") &&
        !JSON.stringify(json).includes("prod_chesnov_sos") &&
        !JSON.stringify(json).includes("sourceVariantId")
    );
    check("payload stays far below the 100KB bridge limit", Buffer.byteLength(JSON.stringify(json), "utf8") < 100_000);
  }
}

rmSync(buildDir, { recursive: true, force: true });

// ── Result ────────────────────────────────────────────────────────────────
await prisma.$disconnect();
if (failures > 0) {
  console.error(`\nSMOKE FAILED — ${failures} problem(s).`);
  process.exit(1);
}
console.log("\nSMOKE OK");
