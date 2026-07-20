import { randomUUID } from "crypto";

/**
 * Generates a safe, unique filename for a stored upload — never derived from
 * the original client-supplied name (which could contain path separators,
 * `..`, null bytes, or just collide with another product's file).
 */
export function generateSafeFilename(extension: string): string {
  const safeExt = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${randomUUID()}.${safeExt}`;
}

/**
 * Strict allowlist check for a filename that will be used to read a file back
 * off disk (the public serving route). Only names shaped exactly like
 * `generateSafeFilename`'s output are accepted — this is the path-traversal
 * guard: no `/`, no `..`, no null bytes, nothing but the expected charset.
 */
const SAFE_FILENAME_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$/;

export function isSafeGeneratedFilename(filename: string): boolean {
  return SAFE_FILENAME_RE.test(filename);
}
