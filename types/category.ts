/** A menu category, e.g. "Пици", "Паста", "Салати". */
export interface Category {
  id: string;
  name: string;
  /** URL slug used in /menu/[category] and as the in-page anchor. */
  slug: string;
  description?: string;
  /** Optional icon (emoji or icon name) shown in the category navigation. */
  icon?: string;
  /** Display order in the menu (ascending). */
  sortOrder: number;
  isActive: boolean;
}
