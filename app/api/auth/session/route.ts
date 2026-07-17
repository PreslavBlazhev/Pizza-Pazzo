import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";

/**
 * Lightweight session probe for client components (Header/MobileNav).
 *
 * Returns just enough to render auth controls: whether someone is signed in and
 * their role. Verifies the JWT cookie only — no DB — so it's cheap. The role
 * here is display-only; every protected action re-checks the DB server-side.
 */
export async function GET() {
  const session = await readSession();
  return NextResponse.json(
    session
      ? { signedIn: true, role: session.role }
      : { signedIn: false, role: "CUSTOMER" as const },
    { headers: { "Cache-Control": "no-store" } }
  );
}
