/**
 * Session cookie helpers — SERVER ONLY (uses `next/headers`).
 *
 * Thin wrapper over `lib/auth/jwt.ts` that reads/writes the httpOnly session
 * cookie. Call these from Server Actions and Route Handlers. Middleware must
 * NOT use this file (no `next/headers` in Edge) — it reads the cookie off the
 * request and calls `verifySession` from `jwt.ts` directly.
 */
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./jwt";

/** Signs a session token and writes it as an httpOnly cookie. */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Removes the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Reads and verifies the current session cookie, or null when signed out. */
export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
