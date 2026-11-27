import { NextResponse, type NextRequest } from "next/server";
import { isSafeGeneratedFilename } from "@/lib/uploads/filename";
import { readGalleryImage } from "@/lib/uploads/gallery-image-storage";

/**
 * Public route serving gallery photos from the Persistent Disk — same
 * rules as app/uploads/products/[filename]/route.ts: outside app/[locale],
 * strict generated-filename allowlist, immutable caching (a new photo always
 * gets a new random name).
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
  if (!isSafeGeneratedFilename(filename)) {
    return new NextResponse(null, { status: 404 });
  }

  const bytes = await readGalleryImage(filename);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  const ext = filename.split(".").pop() ?? "";
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
