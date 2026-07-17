import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Supabase client for **client components** (runs in the browser).
 *
 * Uses the anon key only — every read/write goes through Row Level Security.
 * Returns `null` when Supabase is not configured; callers must handle that
 * (see `components/layout/HeaderAuth.tsx` for the pattern).
 */
export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
