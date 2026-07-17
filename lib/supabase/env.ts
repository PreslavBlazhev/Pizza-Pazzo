/**
 * Supabase environment access + configuration guard.
 *
 * The public site (homepage, menu, product pages) must keep working even when
 * the project has no Supabase keys yet. Every Supabase client in this folder
 * checks `isSupabaseConfigured()` first and returns `null` instead of throwing,
 * so a missing `.env.local` degrades auth gracefully rather than crashing SSR.
 *
 * NOTE: the `process.env.NEXT_PUBLIC_*` reads must stay as literal property
 * accesses — Next.js inlines them at build time only in that exact form.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when both public Supabase keys are present. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Shown in the UI wherever a feature is disabled for lack of configuration. */
export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Supabase не е конфигуриран. Добавете env keys в .env.local.";
