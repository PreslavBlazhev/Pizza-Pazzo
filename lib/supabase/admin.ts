import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * ⚠️  SERVICE ROLE CLIENT — SERVER ONLY. NEVER IMPORT THIS IN A CLIENT COMPONENT.
 *
 * This client uses SUPABASE_SERVICE_ROLE_KEY, which **bypasses Row Level
 * Security completely**. Leaking it to the browser would give any visitor full
 * read/write access to every table and to the auth admin API.
 *
 * Rules:
 *   - Import only from server actions / route handlers / server components.
 *   - Never import from a file that has "use client".
 *   - Never pass the returned client (or the key) to the client as a prop.
 *   - Every caller must check the caller's own role first — this client does no
 *     permission checking of its own.
 *
 * Legitimate uses in this project: listing all users and creating staff/admin
 * accounts from `app/actions/admin-users.ts`, which needs the auth admin API.
 */

// Hard runtime guard: if this module is ever pulled into a browser bundle, fail
// loudly at import time instead of silently shipping the key.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase/admin.ts беше импортнат в client bundle. Този модул е само за сървъра."
  );
}

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** True when the service role key is available (needed for admin user management). */
export function isServiceRoleConfigured(): boolean {
  return isSupabaseConfigured() && SERVICE_ROLE_KEY.length > 0;
}

/**
 * Creates the service-role client. Returns `null` when not configured, so admin
 * pages can render a "not configured" notice instead of crashing.
 */
export function createAdminClient() {
  if (!isServiceRoleConfigured()) return null;

  return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      // A service-role client is stateless: it must never persist or refresh a
      // session, otherwise it could pick up a user's tokens.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
