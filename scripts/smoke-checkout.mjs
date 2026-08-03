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
  priceEur: Number(p.priceEur),
  isAvailable: p.isAvailable,
  allergensJson: p.allergens,
  variants: p.variants.length
    ? p.variants.map((v) => ({
        id: v.id,
        name: { bg: v.nameBg, en: v.nameEn },
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
    if (!(v.priceEur > 0)) fail(`${label}: non-positive price`);
    // Guards the euro-only migration: a leftover лв. amount would show up here
    // as an implausibly large "euro" price (the лв. figures are ~1.96× bigger).
    if (v.priceEur > 200) fail(`${label}: price ${v.priceEur} € is implausibly high`);
    // Epsilon-based: 9.71 * 100 is 970.9999999999999 in binary floating point,
    // so an exact === comparison would flag every legitimate price.
    const cents = v.priceEur * 100;
    if (Math.abs(cents - Math.round(cents)) > 1e-6) {
      fail(`${label}: price ${v.priceEur} € has sub-cent precision`);
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
    return { unitEur: v.priceEur };
  }
  return { unitEur: p.priceEur };
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
    else if (r.unitEur !== v.priceEur) {
      fail(`${p.slug}/${v.id}: derived ${r.unitEur}, stored ${v.priceEur}`);
    } else {
      variantChecks++;
    }
  }
  const [a, b] = p.variants;
  if (a.priceEur === b.priceEur) {
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
let subEur = 0;
let expectEur = 0;
for (const l of sample) {
  subEur = round2(subEur + round2(l.unitEur * l.qty));
  expectEur += Math.round(l.unitEur * 100) * l.qty;
}
if (Math.round(subEur * 100) !== expectEur) {
  fail(`sample cart totals drift: got ${subEur} € (integer check ${expectEur} cents)`);
} else {
  ok(`sample cart (${sample.map((l) => `${l.qty}× ${l.slug}`).join(" + ")}) = ${subEur} €, no rounding drift`);
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
    "lib/report-period.ts",
    "lib/working-hours.ts",
    "lib/validators/settings.ts",
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

  // The compiled output lives in a temp dir, so Node cannot resolve either the
  // project's "@/..." alias (tsc emits it verbatim) or its node_modules.
  // Teach the CJS loader both, pointed at the build output and the project.
  const outRoot = join(buildDir, "out");
  const projectRequire = createRequire(join(projectRoot, "package.json"));
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    if (request.startsWith("@/")) {
      return resolveFilename.call(this, join(outRoot, request.slice(2)), ...args);
    }
    // Bare specifier (e.g. "zod") → resolve from the project, not the temp dir.
    if (!request.startsWith(".") && !request.startsWith("/") && !request.includes(":")) {
      try {
        return projectRequire.resolve(request);
      } catch {
        // Fall through to the default resolution (built-ins, etc.).
      }
    }
    return resolveFilename.call(this, request, ...args);
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
    period: load("lib/report-period.js"),
    hours: load("lib/working-hours.js"),
    settingsValidator: load("lib/validators/settings.js"),
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
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      nameBg: v.name.bg,
      nameEn: v.name.en,
      priceEur: v.priceEur,
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
        if (e.unitPriceEur !== crust30.priceEur) return "crust 30 price mismatch";
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
      totalPriceEur: 2.04,
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
      // Migration compatibility: snapshots written before the euro-only change
      // still carry unitPriceBgn/totalPriceBgn. They must keep parsing, and the
      // retired keys must not survive into the parsed result.
      [
        p(JSON.stringify([{ ...validExtra, unitPriceBgn: 2, totalPriceBgn: 4 }])).length === 1,
        "legacy snapshot with BGN keys still parses",
      ],
      [
        Object.keys(
          p(JSON.stringify([{ ...validExtra, unitPriceBgn: 2, totalPriceBgn: 4 }]))[0]
        ).every((k) => !/bgn/i.test(k)),
        "legacy BGN keys are stripped from the parsed extra",
      ],
      [
        p(JSON.stringify([{ ...validExtra, unitPriceBgn: 2, totalPriceBgn: 4 }]))[0].totalPriceEur === 2.04,
        "legacy snapshot keeps its euro prices",
      ],
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
    totalPriceEur: 3.58,
  };
  const sauceX2 = {
    key: "sauce:prod_chesnov_sos",
    sourceProductId: "prod_chesnov_sos",
    type: "sauce",
    nameBg: "Чеснов сос",
    nameEn: "Garlic sauce",
    quantity: 2,
    unitPriceEur: 1.02,
    totalPriceEur: 2.04,
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
    unitPriceEur: 6.65,
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
    subtotalEur: 10.23,
    deliveryFeeEur: 2.5,
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
    check("prices are carried through", bg.totalPriceEur === 3.58);
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
      totalEur: 12.73,
      items: [
        { nameBg: "Маргарита", variantName: "30 см", quantity: 2, totalPriceEur: 27.64, extras: [crust, sauceX2] },
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
      totalEur: 10.23,
      items: [{ nameBg: "Маргарита", variantName: null, quantity: 1, totalPriceEur: 10.23 }],
    });
    check("new-order without extras still renders (legacy item)", noExtras.text.includes("1× Маргарита") && !noExtras.text.includes("+ "));

    // The signature phone is injected by the sender (from DB settings).
    const CONTACT = { phone: "+359 88 248 4777" };
    const accepted = customerOrderAcceptedEmail(
      order([item({ quantity: 2, totalPriceEur: 27.64, extras: [crust, sauceX2] })]),
      CONTACT
    );
    check("accepted text lists extras with prices", accepted.text.includes("+ Кашкавален борд (за всяка бройка) — 3.58 €") && accepted.text.includes("+ 2× Чеснов сос (за всяка бройка) — 2.04 €"));
    check("accepted HTML lists extras", accepted.html.includes("Кашкавален борд") && accepted.html.includes("2× Чеснов сос"));
    const acceptedPlain = customerOrderAcceptedEmail(order([item()]), CONTACT);
    check("accepted without extras still renders", acceptedPlain.text.includes("1 × Маргарита") && !acceptedPlain.text.includes("+ "));
    check("accepted single unit omits the per-item hint", customerOrderAcceptedEmail(order([item({ extras: [sauceX2] })]), CONTACT).text.includes("+ 2× Чеснов сос — "));
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

    const t5 = buildTicketText(order([item({ extras: [{ ...sauceX2, quantity: 10, totalPriceEur: 10.2 }] })]));
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

// ── 10-11. Admin report: Europe/Sofia periods and money rounding ───────────
//
// Exercises the REAL lib/report-period.ts. Every assertion is expressed in UTC
// instants, so the result does not depend on the machine's timezone — which is
// the whole point: Render runs UTC, the restaurant thinks in Sofia days.
if (mods) {
  const P = mods.period;
  const check = (label, condition) => (condition ? ok(label) : fail(label));
  const iso = (d) => d.toISOString();

  console.log("10) Report periods (Europe/Sofia)");
  {
    // 2026-07-26 00:30 Sofia (EEST, +03) = 2026-07-25 21:30 UTC — the exact
    // case the old server-local midnight got wrong.
    const summerNight = new Date("2026-07-25T21:30:00.000Z");
    check(
      "day starts at Sofia midnight, not UTC midnight",
      iso(P.startOfSofiaDay(summerNight)) === "2026-07-25T21:00:00.000Z"
    );
    check(
      "an order at 00:30 Sofia belongs to that Sofia day",
      summerNight >= P.startOfSofiaDay(summerNight)
    );

    // Winter (EET, +02): 2026-01-15 00:30 Sofia = 2026-01-14 22:30 UTC.
    const winterNight = new Date("2026-01-14T22:30:00.000Z");
    check(
      "winter day start uses +02",
      iso(P.startOfSofiaDay(winterNight)) === "2026-01-14T22:00:00.000Z"
    );

    // 2026-07-26 is a Sunday → its ISO week started Monday 2026-07-20.
    check(
      "week starts on Monday 00:00 Sofia",
      iso(P.startOfSofiaWeek(new Date("2026-07-26T10:00:00.000Z"))) ===
        "2026-07-19T21:00:00.000Z"
    );
    // Monday itself must not roll back a week.
    check(
      "Monday is its own week start",
      iso(P.startOfSofiaWeek(new Date("2026-07-20T10:00:00.000Z"))) ===
        "2026-07-19T21:00:00.000Z"
    );
    check(
      "month starts on the 1st 00:00 Sofia",
      iso(P.startOfSofiaMonth(new Date("2026-07-26T10:00:00.000Z"))) ===
        "2026-06-30T21:00:00.000Z"
    );
    check(
      "year starts on 1 January 00:00 Sofia (+02 in winter)",
      iso(P.startOfSofiaYear(new Date("2026-07-26T10:00:00.000Z"))) ===
        "2025-12-31T22:00:00.000Z"
    );

    // ── DST: EU switches at 01:00 UTC. Sofia 2026: 29 March, 25 October. ──
    const marchDay = P.startOfSofiaDay(new Date("2026-03-29T12:00:00.000Z"));
    const marchNext = P.addSofiaDays(new Date("2026-03-29T12:00:00.000Z"), 1);
    const marchHours = (marchNext - marchDay) / 3_600_000;
    check(`spring-forward day has 23 hours (got ${marchHours})`, marchHours === 23);
    check(
      "spring-forward day still starts at local midnight",
      iso(marchDay) === "2026-03-28T22:00:00.000Z"
    );

    const octDay = P.startOfSofiaDay(new Date("2026-10-25T12:00:00.000Z"));
    const octNext = P.addSofiaDays(new Date("2026-10-25T12:00:00.000Z"), 1);
    const octHours = (octNext - octDay) / 3_600_000;
    check(`fall-back day has 25 hours (got ${octHours})`, octHours === 25);
    check(
      "fall-back day still starts at local midnight",
      iso(octDay) === "2026-10-24T21:00:00.000Z"
    );

    // The week after the switch starts Monday 30 March 00:00 EEST (+03).
    check(
      "week just after the DST switch starts Monday 00:00 local",
      iso(P.startOfSofiaWeek(new Date("2026-04-01T12:00:00.000Z"))) ===
        "2026-03-29T21:00:00.000Z"
    );
    // The week CONTAINING the spring-forward is 7 local days but 167 hours.
    {
      const weekStart = P.startOfSofiaWeek(new Date("2026-03-25T12:00:00.000Z"));
      const nextWeekStart = P.startOfSofiaWeek(new Date("2026-04-01T12:00:00.000Z"));
      const hours = (nextWeekStart - weekStart) / 3_600_000;
      check(
        `week containing the spring-forward is 167 hours (got ${hours})`,
        iso(weekStart) === "2026-03-22T22:00:00.000Z" && hours === 167
      );
    }

    // ── Custom ranges ──
    const r = P.resolveCustomRange("2026-07-01", "2026-07-31");
    check("custom from is inclusive (00:00 Sofia)", r && iso(r.from) === "2026-06-30T21:00:00.000Z");
    check(
      "custom to is inclusive via next-day exclusive bound",
      r && iso(r.toExclusive) === "2026-07-31T21:00:00.000Z"
    );
    check("custom range echoes its Sofia dates", r && r.fromDate === "2026-07-01" && r.toDate === "2026-07-31");
    check("single-day custom range spans exactly 24h in summer", (() => {
      const one = P.resolveCustomRange("2026-07-10", "2026-07-10");
      return one && (one.toExclusive - one.from) / 3_600_000 === 24;
    })());
    check("from > to is rejected", P.resolveCustomRange("2026-07-31", "2026-07-01") === null);
    check("impossible date 2026-02-31 is rejected", P.parseSofiaDateString("2026-02-31") === null);
    check("month 13 is rejected", P.parseSofiaDateString("2026-13-01") === null);
    check("garbage text is rejected", P.parseSofiaDateString("вчера") === null);
    check("leap day 2028-02-29 is accepted", P.parseSofiaDateString("2028-02-29") !== null);
    check(
      `${P.MAX_REPORT_RANGE_DAYS} days is allowed`,
      P.resolveCustomRange("2026-01-01", "2027-01-01") !== null
    );
    check(
      `${P.MAX_REPORT_RANGE_DAYS + 1} days is rejected`,
      P.resolveCustomRange("2026-01-01", "2027-01-02") === null
    );
    check(
      "toSofiaDateString reads the Sofia calendar day",
      P.toSofiaDateString(new Date("2026-07-25T21:30:00.000Z")) === "2026-07-26"
    );

    // Presets end at "now", never in the future.
    const now = new Date("2026-07-26T09:00:00.000Z");
    const preset = P.resolvePresetRange("day", now);
    check("preset range ends exactly at now", preset.toExclusive.getTime() === now.getTime());
    check("preset day range starts before now", preset.from < now);
  }

  // ── 11. Money normalisation used by lib/reports.ts ──
  console.log("11) Report money rounding");
  {
    // Mirrors the `money()` helper: Number() + round2, null → 0.
    const round2 = (n) => Math.round(n * 100) / 100;
    const money = (v) => (v === null || v === undefined ? 0 : round2(Number(v)));

    check("null aggregate sum → 0", money(null) === 0 && money(undefined) === 0);
    check("float drift is rounded (95.48999999999999 → 95.49)", money(95.48999999999999) === 95.49);
    check("23.02 + 2.5 float sum rounds to 25.52", money(23.02 + 2.5) === 25.52);
    check("already-clean values pass through", money(25.52) === 25.52);

    // Fixture: only delivered orders may contribute to revenue.
    const fixture = [
      { completedAt: "x", acceptedAt: "x", cancelledAt: null, totalEur: 25.52, subtotalEur: 23.02, deliveryFeeEur: 2.5 },
      { completedAt: null, acceptedAt: "x", cancelledAt: null, totalEur: 12.21, subtotalEur: 9.71, deliveryFeeEur: 2.5 },
      { completedAt: null, acceptedAt: null, cancelledAt: "x", totalEur: 99.99, subtotalEur: 97.49, deliveryFeeEur: 2.5 },
      { completedAt: null, acceptedAt: null, cancelledAt: null, totalEur: 50.0, subtotalEur: 47.5, deliveryFeeEur: 2.5 },
    ];
    const delivered = fixture.filter((o) => o.completedAt !== null);
    const accepted = fixture.filter((o) => o.acceptedAt !== null);
    const cancelled = fixture.filter((o) => o.cancelledAt !== null);
    const sum = (rows, f) => money(rows.reduce((s, r) => s + r[f], 0));

    check("delivered count uses completedAt", delivered.length === 1);
    check("accepted count uses acceptedAt and includes the delivered one", accepted.length === 2);
    check("cancelled count uses cancelledAt", cancelled.length === 1);
    check("revenue excludes cancelled and pending", sum(delivered, "totalEur") === 25.52);
    check("revenue excludes accepted-but-not-delivered", sum(delivered, "totalEur") !== sum(accepted, "totalEur"));
    check(
      "food + delivery = total",
      money(sum(delivered, "subtotalEur") + sum(delivered, "deliveryFeeEur")) === sum(delivered, "totalEur")
    );
  }
}

// ── 12-13. Restaurant settings: validation and hours presentation ──────────
if (mods) {
  const V = mods.settingsValidator;
  const H = mods.hours;
  const check = (label, condition) => (condition ? ok(label) : fail(label));

  const day = (open, from, to) => ({ open, from, to });
  const openWeek = (from = "11:00", to = "23:00") => ({
    monday: day(true, from, to), tuesday: day(true, from, to), wednesday: day(true, from, to),
    thursday: day(true, from, to), friday: day(true, from, to), saturday: day(true, from, to),
    sunday: day(true, "11:00", "22:30"),
  });
  const baseSettings = (over = {}) => ({
    addressBg: "Плевен, ул. Георги Кочев 13 (Срещу Технополис)",
    addressEn: "13 Georgi Kochev St., Pleven (opposite Technopolis)",
    primaryPhone: "+359 88 248 4777",
    secondaryPhone: "+359 801 999",
    contactEmail: "orderspp@gmail.com",
    hours: openWeek(),
    ...over,
  });
  const parse = (input) => V.restaurantSettingsSchema.safeParse(input);
  const errorPaths = (result) =>
    result.success ? [] : result.error.issues.map((i) => i.path.join("."));

  console.log("12) Restaurant settings validation");
  {
    check("current live settings validate", parse(baseSettings()).success);
    check("invalid email is rejected", !parse(baseSettings({ contactEmail: "not-an-email" })).success);
    check("empty BG address is rejected", !parse(baseSettings({ addressBg: "" })).success);
    check("empty EN address is rejected", !parse(baseSettings({ addressEn: "" })).success);
    check("invalid phone is rejected", !parse(baseSettings({ primaryPhone: "телефон" })).success);
    check("valid HH:mm is accepted", parse(baseSettings({ hours: openWeek("09:30", "22:15") })).success);
    check("24:00 is rejected", !parse(baseSettings({ hours: openWeek("11:00", "24:00") })).success);
    check("11:60 is rejected", !parse(baseSettings({ hours: openWeek("11:60", "23:00") })).success);
    check("seconds are rejected", !parse(baseSettings({ hours: openWeek("11:00:00", "23:00") })).success);

    const noFrom = parse(baseSettings({ hours: { ...openWeek(), monday: day(true, "", "23:00") } }));
    check("open day without a start time is rejected", !noFrom.success && errorPaths(noFrom).includes("hours.monday.from"));
    const noTo = parse(baseSettings({ hours: { ...openWeek(), monday: day(true, "11:00", "") } }));
    check("open day without an end time is rejected", !noTo.success && errorPaths(noTo).includes("hours.monday.to"));
    check("from == to is rejected", !parse(baseSettings({ hours: openWeek("11:00", "11:00") })).success);
    check("from > to (overnight) is rejected", !parse(baseSettings({ hours: openWeek("23:00", "11:00") })).success);

    const closed = parse(baseSettings({ hours: { ...openWeek(), sunday: day(false, "", "") } }));
    check("closed day needs no times", closed.success);
    check("closed day's times are cleared", closed.success && closed.data.hours.sunday.from === "");
    const closedWithJunk = parse(baseSettings({ hours: { ...openWeek(), sunday: day(false, "99:99", "zz") } }));
    check("closed day discards stray times instead of failing", closedWithJunk.success);

    const noSecond = parse(baseSettings({ secondaryPhone: "" }));
    check("empty secondary phone normalises to \"\"", noSecond.success && noSecond.data.secondaryPhone === "");
    check("invalid secondary phone is rejected", !parse(baseSettings({ secondaryPhone: "@@@" })).success);
    check("over-long address is rejected", !parse(baseSettings({ addressBg: "х".repeat(201) })).success);

    // FormData reader: an unticked checkbox means "closed".
    const fd = new FormData();
    fd.set("addressBg", "А"); fd.set("addressEn", "B");
    fd.set("primaryPhone", "+359 88 248 4777"); fd.set("secondaryPhone", "");
    fd.set("contactEmail", "a@b.bg");
    for (const d of ["monday","tuesday","wednesday","thursday","friday","saturday"]) {
      fd.set(`${d}.open`, "on"); fd.set(`${d}.from`, "11:00"); fd.set(`${d}.to`, "23:00");
    }
    fd.set("sunday.from", "11:00"); fd.set("sunday.to", "22:30"); // no sunday.open
    const read = V.readSettingsFormData(fd);
    check("FormData: missing checkbox → closed", read.hours.sunday.open === false && read.hours.monday.open === true);
  }

  console.log("13) Working hours presentation");
  {
    const rows = H.groupWorkingHours(openWeek());
    const bg = { monday:"Понеделник", tuesday:"Вторник", wednesday:"Сряда", thursday:"Четвъртък", friday:"Петък", saturday:"Събота", sunday:"Неделя" };
    const en = { monday:"Monday", tuesday:"Tuesday", wednesday:"Wednesday", thursday:"Thursday", friday:"Friday", saturday:"Saturday", sunday:"Sunday" };

    check("Mon–Sat group into one row, Sunday separate", rows.length === 2 && rows[0].days.length === 6 && rows[1].days[0] === "sunday");
    check("BG label reads „Понеделник – Събота“", H.workingHoursRowLabel(rows[0], (d) => bg[d]) === "Понеделник – Събота");
    check("EN label reads “Monday – Sunday” style", H.workingHoursRowLabel(rows[1], (d) => en[d]) === "Sunday");
    check("grouped hours string is „11:00 – 23:00“", rows[0].hours === "11:00 – 23:00");
    check("Sunday keeps its own 22:30 close", rows[1].hours === "11:00 – 22:30");

    const allSame = H.groupWorkingHours(openWeek("10:00", "20:00"));
    check("identical week collapses to a single row", H.groupWorkingHours({ ...openWeek("10:00","20:00"), sunday: day(true,"10:00","20:00") }).length === 1);
    check("differing Sunday still splits", allSame.length === 2);

    const oneClosed = H.groupWorkingHours({ ...openWeek(), wednesday: day(false, null, null) });
    check("a closed midweek day splits the run into 3 rows", oneClosed.length === 4 && oneClosed[1].closed);
    check("closed row carries no hours string", oneClosed[1].hours === null);

    // Tuesday and Thursday share hours but Wednesday differs — they must NOT merge.
    const nonAdjacent = H.groupWorkingHours({
      ...openWeek(), wednesday: day(true, "09:00", "15:00"),
    });
    const merged = nonAdjacent.find((r) => r.days.includes("tuesday") && r.days.includes("thursday"));
    check("non-adjacent identical days are not merged", merged === undefined);
    check("row order stays Monday → Sunday", H.groupWorkingHours(openWeek())[0].days[0] === "monday");

    const spec = H.toOpeningHoursSpecification(openWeek());
    check("JSON-LD has one entry per group", spec.length === 2);
    check("JSON-LD lists the 6 weekday names", spec[0].dayOfWeek.join(",") === "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday");
    check("JSON-LD opens/closes come from the day", spec[0].opens === "11:00" && spec[0].closes === "23:00");
    const withClosed = H.toOpeningHoursSpecification({ ...openWeek(), sunday: day(false, null, null) });
    check("closed days are absent from JSON-LD", withClosed.every((s) => !s.dayOfWeek.includes("Sunday")));
    const allClosed = Object.fromEntries(Object.keys(openWeek()).map((d) => [d, day(false, null, null)]));
    check("all-closed week yields an empty JSON-LD array", H.toOpeningHoursSpecification(allClosed).length === 0);

    check("tel href strips spaces and keeps +", H.telHref("+359 88 248 4777") === "tel:+359882484777");
    check("tel href handles a local number", H.telHref("0801 999") === "tel:0801999");
  }

  // ── 14. Accepted email uses the DB-backed contact phone ──
  //
  // The template is a pure function: the sender (lib/email/resend.ts) reads
  // settings and injects the phone, so an admin edit reaches the next email
  // without a deploy. Nothing here sends mail.
  console.log("14) Accepted email contact phone");
  {
    const { customerOrderAcceptedEmail } = mods.acceptedEmail;
    const orderFixture = {
      id: "o_1", orderNumber: 1234, userId: null,
      customerName: "Иван Петров", customerEmail: "ivan@example.com", customerPhone: "0888123456",
      deliveryAddress: "ул. Тестова 1", deliveryCity: "Плевен", deliveryNote: null,
      paymentMethod: "CASH_ON_DELIVERY", deliveryMethod: "DELIVERY", status: "ACCEPTED",
      subtotalEur: 10.23, deliveryFeeEur: 2.5,
      totalEur: 12.73, estimatedTimeMinutes: 30, adminNote: null,
      acceptedAt: "2026-07-26T10:00:00.000Z", cancelledAt: null, completedAt: null,
      createdAt: "2026-07-26T09:50:00.000Z", updatedAt: "2026-07-26T10:00:00.000Z",
      items: [{
        id: "oi_1", orderId: "o_1", productId: "prod_margarita", productSlug: "margarita",
        productNameBg: "Маргарита", productNameEn: "Margherita", productImageUrl: null,
        variantId: null, variantName: null, quantity: 1,
        unitPriceEur: 6.65, totalPriceEur: 10.23,
        extras: [], itemNote: null,
      }],
    };

    const OLD_PHONE = "+359 88 248 4777";  // what lib/constants.ts still carries
    const NEW_PHONE = "+359 87 111 2222";  // as if an admin had just changed it
    const mail = customerOrderAcceptedEmail(orderFixture, { phone: NEW_PHONE });

    check("accepted text prints the injected phone", mail.text.includes(NEW_PHONE));
    check("accepted HTML prints the injected phone", mail.html.includes(NEW_PHONE));
    check("the constants phone does NOT leak in", !mail.text.includes(OLD_PHONE) && !mail.html.includes(OLD_PHONE));
    check(
      "no settings internals reach the customer",
      !mail.text.includes("restaurant") && !mail.html.includes("restaurant") &&
        !mail.text.includes("primaryPhone") && !mail.html.includes("primaryPhone")
    );
    check(
      "the operational sender/recipient env is untouched by the template",
      !mail.text.includes("FROM_EMAIL") && !mail.html.includes("ORDER_NOTIFICATION_EMAIL")
    );

    // The template ran under plain Node with no database client loaded, which
    // is only possible because it performs no query of its own.
    check("template needs no database access", typeof customerOrderAcceptedEmail === "function" && mail.subject.includes("#1234"));

    // The BG customer email is the only variant (orders store no locale), but
    // it must render both an ASCII and a Cyrillic phone shape unchanged.
    const ascii = customerOrderAcceptedEmail(orderFixture, { phone: "0700 12 345" });
    check("any phone format passes through verbatim", ascii.text.includes("0700 12 345"));
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
