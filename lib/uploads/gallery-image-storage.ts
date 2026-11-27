import { db } from "@/lib/db";
import { generateSafeFilename } from "./filename";
import { extractGalleryImageFilename, toPublicGalleryImagePath } from "./paths";
import { uploadStorage as storage } from "./storage";

/** Same rules as category-image-storage.ts, under the `gallery/` subfolder. */
const GALLERY_SUBDIR = "gallery";

/** Saves an already-normalized WebP and returns the public path for the DB. */
export async function saveGalleryImage(webpBytes: Uint8Array): Promise<string> {
  const filename = generateSafeFilename("webp");
  await storage.save(GALLERY_SUBDIR, filename, webpBytes);
  return toPublicGalleryImagePath(filename);
}

export async function readGalleryImage(filename: string): Promise<Uint8Array | null> {
  return storage.read(GALLERY_SUBDIR, filename);
}

/** Best-effort removal of a just-saved file whose DB write then failed. */
export async function discardGalleryImage(publicPath: string): Promise<void> {
  const filename = extractGalleryImageFilename(publicPath);
  if (filename) await storage.remove(GALLERY_SUBDIR, filename);
}

/**
 * Deletes the file behind `publicPath` once no gallery row points at it any
 * more (photo replaced or tile deleted). Bundled placeholders and anything
 * that isn't one of our uploads are never touched. Never throws.
 */
export async function deleteGalleryImageIfUnused(publicPath: string): Promise<void> {
  try {
    const filename = extractGalleryImageFilename(publicPath);
    if (!filename) return;
    const stillUsed = await db.galleryImage.findFirst({
      where: { imageUrl: publicPath },
      select: { id: true },
    });
    if (stillUsed) return;
    await storage.remove(GALLERY_SUBDIR, filename);
  } catch {
    // best-effort
  }
}
