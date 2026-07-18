/**
 * Merges the three ".docx-parsing artifact" duplicates — the same product in
 * two sizes stored as two separate products — into one product with variants,
 * the same shape the 39 pizzas already use:
 *
 *   Coca-Cola 330 мл + Coca-Cola 1 л            → coca-cola     (2 variants)
 *   Минерална вода Банкя 500 мл + 1.5 л         → mineralna-voda-bankya
 *   Пикантни картофи 100 г + 200 г              → pikantni-kartofi
 *
 * Prices are carried over exactly; the per-product `size` becomes the variant
 * name; the base price stays the cheaper (smaller) size, matching the pizzas.
 * Idempotent: already-merged products are skipped, so it is safe to re-run
 * after a fresh .docx import (run it AFTER migrate-menu-i18n.mjs).
 *
 * Usage: node scripts/merge-duplicate-size-products.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const MENU_PATH = new URL("../data/pizza-pazzo-menu.json", import.meta.url);

const MERGES = [
  { keep: "prod_coca_cola", drop: "prod_coca_cola_2", varPrefix: "var_coca_cola" },
  {
    keep: "prod_mineralna_voda_bankya",
    drop: "prod_mineralna_voda_bankya_2",
    varPrefix: "var_mineralna_voda_bankya",
  },
  { keep: "prod_pikantni_kartofi", drop: "prod_pikantni_kartofi_2", varPrefix: "var_pikantni_kartofi" },
];

const products = JSON.parse(readFileSync(MENU_PATH, "utf8"));
let changed = false;

for (const m of MERGES) {
  const keep = products.find((p) => p.id === m.keep);
  const drop = products.find((p) => p.id === m.drop);

  if (!keep) throw new Error(`Base product missing: ${m.keep}`);
  if (!drop) {
    console.log(`already merged, skipping: ${m.keep}`);
    continue;
  }
  if (keep.variants?.length || drop.variants?.length) {
    throw new Error(`Unexpected variants on ${m.keep}/${m.drop} — refusing to merge`);
  }
  if (!keep.size || !drop.size) {
    throw new Error(`Missing size on ${m.keep}/${m.drop} — nothing to turn into variant names`);
  }

  keep.variants = [
    { id: `${m.varPrefix}_1`, name: keep.size, priceBgn: keep.priceBgn, priceEur: keep.priceEur },
    { id: `${m.varPrefix}_2`, name: drop.size, priceBgn: drop.priceBgn, priceEur: drop.priceEur },
  ];
  delete keep.size; // the size now lives in the variant names
  products.splice(products.indexOf(drop), 1);
  changed = true;
  console.log(`merged ${m.drop} into ${m.keep} (${keep.variants.map((v) => v.name.bg).join(" / ")})`);
}

if (changed) {
  writeFileSync(MENU_PATH, JSON.stringify(products, null, 2) + "\n", "utf8");
  console.log(`written: ${products.length} products`);
} else {
  console.log("no changes needed");
}
