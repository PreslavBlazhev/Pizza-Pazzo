import { db } from "@/lib/db";
import { generateSafeFilename } from "./filename";
import { extractCategoryImageFilename, toPublicCategoryImagePath } from "./paths";
import { uploadStorage as storage } from "./storage";

const CATEGORIES_SUBDIR = "categories";

/** Saves an already-normalized WebP and returns the public path for the DB. */
export async function saveCategoryImage(webpBytes: Uint8Array): Promise<string> {
  const filename = generateSafeFilename("webp");
  await storage.save(CATEGORIES_SUBDIR, filename, webpBytes);
  return toPublicCategoryImagePath(filename);
}

export async function readCategoryImage(filename: string): Promise<Uint8Array | null> {
  return storage.read(CATEGORIES_SUBDIR, filename);
}

/** Best-effort removal of a just-saved file whose DB write then failed. */
export async function discardCategoryImage(publicPath: string): Promise<void> {
  const filename = extractCategoryImageFilename(publicPath);
  if (filename) await storage.remove(CATEGORIES_SUBDIR, filename);
}

/**
 * Deletes the file behind `publicPath` after a category got a NEW photo —
 * unless it isn't one of our uploads or another category still uses it.
 * Never throws: an orphan file is harmless, a failed save is not.
 */
export async function deleteCategoryImageIfUnused(
  publicPath: string,
  excludeCategoryId: string
): Promise<void> {
  try {
    const filename = extractCategoryImageFilename(publicPath);
    if (!filename) return;
    const stillUsed = await db.menuCategory.findFirst({
      where: { imageUrl: publicPath, id: { not: excludeCategoryId } },
      select: { id: true },
    });
    if (stillUsed) return;
    await storage.remove(CATEGORIES_SUBDIR, filename);
  } catch {
    // best-effort
  }
}
