import { db } from "@/lib/db";
import { generateSafeFilename } from "./filename";
import { extractProductImageFilename, toPublicProductImagePath } from "./paths";
import { uploadStorage as storage } from "./storage";

const PRODUCTS_SUBDIR = "products";

/** Saves a validated image and returns the public path to store on the product. */
export async function saveProductImage(bytes: Uint8Array, extension: string): Promise<string> {
  const filename = generateSafeFilename(extension);
  await storage.save(PRODUCTS_SUBDIR, filename, bytes);
  return toPublicProductImagePath(filename);
}

/** Reads a product image back by its public-facing filename (used by the
 *  public serving route). Returns null if it does not exist. */
export async function readProductImage(filename: string): Promise<Uint8Array | null> {
  return storage.read(PRODUCTS_SUBDIR, filename);
}

/**
 * Deletes the file behind `publicPath` UNLESS:
 *  - it isn't one of our generated upload paths (e.g. a manually-typed
 *    `/images/...` path or an external URL) — never touch those;
 *  - another product still references the exact same path.
 *
 * Best-effort and silent: called after a successful DB write replacing/
 * clearing a product's image, never blocks or fails the save itself.
 */
export async function deleteProductImageIfUnused(
  publicPath: string,
  excludeProductId: string
): Promise<void> {
  const filename = extractProductImageFilename(publicPath);
  if (!filename) return; // not one of our files — never delete

  const stillUsed = await db.menuProduct.findFirst({
    where: { imageUrl: publicPath, id: { not: excludeProductId } },
    select: { id: true },
  });
  if (stillUsed) return; // shared — keep it

  await storage.remove(PRODUCTS_SUBDIR, filename);
}
