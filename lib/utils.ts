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
