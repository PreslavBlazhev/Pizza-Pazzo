import { NextResponse, type NextRequest } from "next/server";
import { isSafeGeneratedFilename } from "@/lib/uploads/filename";
import { readProductImage } from "@/lib/uploads/product-image-storage";

/**
 * Public route serving uploaded product photos from the Persistent Disk (see
 * lib/uploads/paths.ts). Deliberately OUTSIDE app/[locale] — like
 * robots.txt/sitemap.xml, a path with a file extension is excluded from the
 * i18n middleware matcher (middleware.ts), so this never gets locale-prefixed
 * or auth-checked; the images are public menu content, same as anything in
 * /public.
 *
 * `next/image` cannot read these through its built-in local-file path (that
 * only covers /public); ProductImage.tsx renders these `unoptimized`, so the
 * browser fetches this route directly.
 */
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Strict allowlist — rejects `..`, `/`, null bytes, anything not shaped
  // exactly like a name this app generated itself (see generateSafeFilename).
  if (!isSafeGeneratedFilename(filename)) {
    return new NextResponse(null, { status: 404 });
  }

  const bytes = await readProductImage(filename);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  const ext = filename.split(".").pop() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Filenames are random and immutable (a changed photo gets a new name),
      // so this is always a fresh file, not a stale cached one.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
