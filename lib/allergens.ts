import allergensJson from "@/data/allergens.json";

export interface Allergen {
  id: string;
  name: string;
  description: string;
}

export const ALLERGENS = allergensJson as Allergen[];

const byId = new Map(ALLERGENS.map((a) => [a.id, a]));

/** Full allergen object by id, or undefined if unknown. */
export function getAllergen(id: string): Allergen | undefined {
  return byId.get(id);
}

/** Display name for an allergen id (falls back to the id itself). */
export function getAllergenName(id: string): string {
  return byId.get(id)?.name ?? id;
}

/** Short description for an allergen id (empty string if unknown). */
export function getAllergenDescription(id: string): string {
  return byId.get(id)?.description ?? "";
}

/**
 * Map a list of allergen ids to their display names.
 * Returns [] for an empty/undefined list — callers decide the empty-state text.
 */
export function formatAllergens(ids: string[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  return ids.map(getAllergenName);
}
