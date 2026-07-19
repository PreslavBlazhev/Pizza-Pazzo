/**
 * Fills PROVISIONAL allergens for the products the source .docx left blank,
 * and marks them `allergensUnverified: true` until the kitchen confirms them
 * (EU 1169/2011 — see docs/client-allergens-needed.md for the confirmation
 * table sent to the client).
 *
 * The values are NOT invented from thin air — each one is derived from what
 * this same kitchen already declares for its closest analogous product (their
 * breaded chicken items declare `milk`, their Caesar dressing declares
 * `mustard`, …) plus what the recipe makes certain (a wheat spring-roll
 * wrapper is gluten; croutons are gluten; parmesan is milk).
 *
 * The two barley beers get `gluten` WITHOUT the flag — that is a fact of the
 * product, not a guess, and the client doc itself asks for it to be declared.
 *
 * Idempotent: re-running changes nothing. Run AFTER migrate-menu-i18n.mjs and
 * merge-duplicate-size-products.mjs if the menu is ever re-imported from docx.
 *
 *   node scripts/apply-provisional-allergens.mjs
 *
 * When the restaurant confirms a product, set its final `allergens` in
 * data/pizza-pazzo-menu.json and DELETE its `allergensUnverified` flag (and
 * remove the slug here so a re-import doesn't resurrect the guess).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MENU_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "pizza-pazzo-menu.json"
);

/**
 * slug → provisional allergen ids (may be empty: "we believe none, but the
 * kitchen must confirm"). Every entry here also gets allergensUnverified.
 * Reasoning per product lives in docs/client-allergens-needed.md.
 */
const PROVISIONAL = {
  // Пица добавки — vegetable toppings, no allergenic component expected.
  zelenchukovi: [],
  // Предястия
  "parzheni-kartofi": [], // plain fries; the cheese version declares only milk
  "proletni-rultsa": ["gluten", "soybeans"], // wheat wrapper + soy in filling
  "proletni-rultsa-s-pile": ["gluten", "soybeans"],
  "mamini-kyuftentsa": ["gluten"], // bread/rusk binder typical for кюфтета
  "pikantni-kartofi": [], // spice mix — kitchen must rule out mustard (резанки have it)
  // Бургер добавки
  "hrupkavo-pile-2": ["gluten", "milk"], // breading; their хапки/бонфиленца declare milk
  "pileshko-teleshko-kyufte": ["gluten"],
  "bekon-shunka": [], // cured meats; cheap ham can hide milk/soy — confirm
  zelenchukova: [],
  // Салати
  "tsezar-2": ["gluten", "milk", "mustard"], // croutons + parmesan/chicken + their Caesar dressing
};

/** slug → confirmed allergens (facts of the product, no flag). */
const CONFIRMED = {
  "stela-artoa": ["gluten"], // barley malt beer
  hayneken: ["gluten"],
};

const products = JSON.parse(readFileSync(MENU_PATH, "utf8"));
let provisional = 0;
let confirmed = 0;

for (const p of products) {
  if (p.slug in PROVISIONAL) {
    p.allergens = [...PROVISIONAL[p.slug]];
    p.allergensUnverified = true;
    provisional++;
  } else if (p.slug in CONFIRMED) {
    p.allergens = [...CONFIRMED[p.slug]];
    delete p.allergensUnverified;
    confirmed++;
  }
}

const missing = [
  ...Object.keys(PROVISIONAL),
  ...Object.keys(CONFIRMED),
].filter((slug) => !products.some((p) => p.slug === slug));
if (missing.length > 0) {
  console.error(`✗ slugs not found in menu: ${missing.join(", ")}`);
  process.exit(1);
}

writeFileSync(MENU_PATH, JSON.stringify(products, null, 2) + "\n", "utf8");
console.log(
  `✔ provisional allergens on ${provisional} products (flagged unverified), ` +
    `confirmed on ${confirmed} beers`
);
