/**
 * Compares the message catalogues against the reference locale (bg).
 *
 * TypeScript checks that a key *used in code* exists, but it cannot see that
 * en.json is missing a key that bg.json has — that only shows up as Bulgarian
 * text leaking onto the English site. This script fails the build instead.
 *
 * Run: npm run check:i18n
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE = "bg";
const LOCALES = ["bg", "en"];

/** Flattens { a: { b: "x" } } to ["a.b"]. */
function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object"
      ? flatten(value, path)
      : [path];
  });
}

function load(locale) {
  const file = join(root, "messages", `${locale}.json`);
  return flatten(JSON.parse(readFileSync(file, "utf8")));
}

const reference = load(REFERENCE);
let failed = false;

for (const locale of LOCALES.filter((l) => l !== REFERENCE)) {
  const keys = load(locale);
  const missing = reference.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !reference.includes(k));

  if (missing.length) {
    failed = true;
    console.error(`\n${locale}.json is missing ${missing.length} key(s):`);
    missing.forEach((k) => console.error(`  - ${k}`));
  }

  if (extra.length) {
    failed = true;
    console.error(`\n${locale}.json has ${extra.length} key(s) not in ${REFERENCE}.json:`);
    extra.forEach((k) => console.error(`  + ${k}`));
  }
}

if (failed) {
  process.exit(1);
}

console.log(`i18n OK — ${reference.length} keys, locales in sync: ${LOCALES.join(", ")}`);
