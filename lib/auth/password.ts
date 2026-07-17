/**
 * Password hashing — SERVER ONLY.
 *
 * bcryptjs (pure JS) so there is no native build step on Windows or Render.
 * NOTE: bcrypt silently truncates input past 72 bytes — the register/login
 * validators cap password length at 72 (see lib/validators/auth.ts).
 *
 * Never import this from Client Components or Edge middleware.
 */
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
