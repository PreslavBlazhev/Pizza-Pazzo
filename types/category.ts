import type { LocalizedText } from "./i18n";

/**
 * A menu category, resolved for one locale (e.g. "Пици" / "Pizzas").
 *
 * Get one from `lib/menu-data.ts` — see the note on `Product`.
 */
export interface Category {
  id: string;
  name: string;
  /** URL slug used in /menu/[category]. Never localized, so the same slug
   *  resolves under both /menu/... and /en/menu/... */
  slug: string;
  description?: string;
  /** Legacy emoji — shown only while the category has no photo. */
  icon?: string;
  /** Category photo uploaded from the admin (/uploads/categories/...). */
  imageUrl?: string;
  /** Display order in the menu (ascending). */
  sortOrder: number;
  isActive: boolean;
}

/** The stored shape in `data/categories.json`, before locale resolution. */
export interface RawCategory extends Omit<Category, "name" | "description"> {
  name: LocalizedText;
  description?: LocalizedText;
}
