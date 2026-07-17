import type { Locale } from "@/i18n/routing";

/**
 * A piece of menu text stored in every language.
 *
 * This is the *stored* shape (what sits in data/*.json). The UI never sees it:
 * `lib/menu-data.ts` resolves it to a plain string for the active locale, so
 * components keep working with `product.name` as before.
 *
 * When the database arrives this becomes a translations table; the resolve step
 * stays in the same place.
 */
export type LocalizedText = Record<Locale, string>;
