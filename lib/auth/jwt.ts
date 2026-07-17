/**
 * Session JWT — sign & verify only. No `next/headers`, no Prisma, so this is
 * safe to import from Edge middleware as well as Node server code.
 *
 * The token is a signed (HS256) JWT stored in an httpOnly cookie. It carries
 * just enough to gate routes without a DB round-trip: the user id, email and
 * role. Anything authoritative (is the account still active? current role?) is
 * re-checked against the database in `lib/auth.ts` for server actions/pages.
 */
import { SignJWT, jwtVerify } from "jose";
import { isUserRole, type UserRole } from "@/types/auth";

export const SESSION_COOKIE = "pp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const ALG = "HS256";

export interface SessionPayload {
  /** User id (JWT `sub`). */
  sub: string;
  email: string;
  role: UserRole;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random string in .env " +
        "(e.g. `openssl rand -base64 32`)."
    );
  }
  return new TextEncoder().encode(secret);
}

/** Signs a session token. Throws if AUTH_SECRET is not configured. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

/**
 * Verifies a token and returns its payload, or `null` when the token is
 * missing/expired/tampered/misconfigured. Never throws — a bad token is just a
 * signed-out visitor.
 */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    const sub = payload.sub;
    const email = payload.email;
    const role = payload.role;
    if (typeof sub !== "string" || typeof email !== "string" || !isUserRole(role)) {
      return null;
    }
    return { sub, email, role };
  } catch {
    return null;
  }
}
