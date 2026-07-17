import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Refreshes the Supabase auth session inside Next.js middleware.
 *
 * Supabase access tokens are short-lived; without this the user is silently
 * logged out when the token expires. The refreshed cookies must be written onto
 * the response that is actually returned — hence the `supabaseResponse` dance
 * below (this is the pattern Supabase documents for @supabase/ssr).
 *
 * Returns the response to send plus the authenticated user (or null), so the
 * caller in `middleware.ts` can make its routing decisions without a second
 * round-trip.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // No keys yet → nothing to refresh; treat everyone as a guest.
  if (!isSupabaseConfigured()) {
    return { supabaseResponse, user: null, supabase: null };
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: always use getUser() here, never getSession(). getUser()
  // revalidates the token with Supabase; getSession() trusts the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user, supabase };
}
