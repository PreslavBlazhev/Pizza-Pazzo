/**
 * The EU allergen list (Regulation 1169/2011).
 *
 * This file owns the ids and their canonical order; the names and descriptions
 * live in the `allergens` message namespace, because they must exist in both
 * languages. Read one with `useTranslations("allergens")` and `t(`${id}.name`)`
 * — guarded by `isAllergenId`, which is what makes that key type-safe.
 */
export const ALLERGEN_IDS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export type AllergenId = (typeof ALLERGEN_IDS)[number];

const known: ReadonlySet<string> = new Set(ALLERGEN_IDS);

export function isAllergenId(id: string): id is AllergenId {
  return known.has(id);
}

/**
 * The allergen ids for a product, in the canonical EU order rather than the
 * order they happen to sit in the data — so "gluten, milk" always reads the
 * same way across the menu.
 *
 * Returns [] for an empty/undefined list — callers decide the empty-state text.
 * An id outside the EU list is sorted last but kept, not dropped: silently
 * hiding an allergen is the one failure mode that actually harms someone, so an
 * unrecognised id is rendered raw and shows up as something to fix.
 */
export function orderedAllergens(ids: string[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  const index = (id: string) => {
    const i = (ALLERGEN_IDS as readonly string[]).indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...ids].sort((a, b) => index(a) - index(b));
}
