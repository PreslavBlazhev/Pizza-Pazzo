import path from "path";

/**
 * Where uploaded files live on disk, and the public URL prefix they are
 * served under. Mirrors the DATABASE_URL pattern in this project: an explicit
 * env var per environment rather than auto-detection, so there is one place
 * that decides "where is persistent storage" (see render.yaml + .env.example).
 *
 * On Render, `UPLOADS_DIR` is set to `/var/data/uploads` — a subdirectory of
 * the same Persistent Disk the SQLite database lives on (render.yaml), so
 * uploaded product photos survive redeploys and restarts exactly like the DB
 * does. Locally, it falls back to a gitignored folder under the project root.
 */
const DEFAULT_DEV_UPLOADS_DIR = path.join(process.cwd(), ".data", "uploads");

export function getUploadsRoot(): string {
  const configured = process.env.UPLOADS_DIR?.trim();
  return configured || DEFAULT_DEV_UPLOADS_DIR;
}

/** Absolute directory on disk where product images are stored. */
export function getProductImagesDir(): string {
  return path.join(getUploadsRoot(), "products");
}

/** Public URL prefix product image paths are served under (see the route
 *  handler at app/uploads/products/[filename]/route.ts). Stored in the
 *  database as `${PRODUCT_IMAGES_PUBLIC_PREFIX}/<filename>` — never the
 *  filesystem path. */
export const PRODUCT_IMAGES_PUBLIC_PREFIX = "/uploads/products";

export function toPublicProductImagePath(filename: string): string {
  return `${PRODUCT_IMAGES_PUBLIC_PREFIX}/${filename}`;
}

/** Extracts the filename from a stored public path, or null if it isn't one
 *  of ours (e.g. a manually-entered `/images/...` path or an external URL). */
export function extractProductImageFilename(publicPath: string): string | null {
  if (!publicPath.startsWith(`${PRODUCT_IMAGES_PUBLIC_PREFIX}/`)) return null;
  const rest = publicPath.slice(PRODUCT_IMAGES_PUBLIC_PREFIX.length + 1);
  // No further path segments allowed — a single filename only.
  if (rest.includes("/") || rest.length === 0) return null;
  return rest;
}
