/** Small, dependency-free helpers. */

/** Join class names, dropping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** URL-friendly slug from a string (handles Cyrillic loosely by stripping). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Bulgarian → Latin, the official scheme (Закон за транслитерацията).
 *
 * It is the scheme the menu was originally imported with, so it keeps new
 * products consistent with the slugs already in the database and already
 * indexed by Google: пържени → parzheni, кюфте → kyufte, щ → sht, ъ → a.
 */
const BG_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht",
  ъ: "a", ь: "y", ю: "yu", я: "ya",
};

/** Latin transliteration of Bulgarian text; other scripts pass through. */
export function transliterateBg(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => BG_TO_LATIN[ch] ?? ch)
    .join("");
}

/**
 * A slug that is always Latin, for anything that becomes a public URL.
 *
 * `slugify` deliberately keeps Cyrillic (it is used where readability beats
 * URL-safety); this one does not, because a product slug ends up in
 * /product/<slug> next to a hundred transliterated ones.
 */
export function latinSlug(input: string): string {
  return transliterateBg(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Simple unique id for client-side use (not cryptographically secure). */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Format an ISO date string for display.
 *
 * Always rendered in **Europe/Sofia**, never in the runtime's timezone: the
 * database stores UTC and Render runs UTC, so without this a 01:00 Sofia order
 * would print as the previous day's 22:00 to the staff reading the admin.
 */
export function formatDateTime(iso: string, locale = "bg-BG"): string {
  return new Date(iso).toLocaleString(locale, { timeZone: "Europe/Sofia" });
}
