import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Supabase client for **server components, route handlers and server actions**.
 *
 * Reads/writes the auth session from Next.js cookies. Still anon-key based, so
 * RLS applies — this is the client to use for anything acting *as the user*.
 *
 * Returns `null` when Supabase is not configured.
 */
export async function createClient() {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: the middleware refreshes the session cookies.
        }
      },
    },
  });
}
