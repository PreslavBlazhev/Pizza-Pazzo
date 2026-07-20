import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { saveProductImage } from "@/lib/uploads/product-image-storage";
import { validateProductImageUpload } from "@/lib/uploads/validate";

/**
 * Admin product-image upload. ADMIN+ only — the same role required to edit a
 * product's other fields (app/actions/admin-menu.ts). The middleware skips
 * /api entirely (see middleware.ts), so this route re-checks the session and
 * role itself, exactly like /api/admin/pending-orders.
 *
 * Accepts multipart/form-data with a single `image` field. Never trusts the
 * client's declared filename/MIME type — validateProductImageUpload sniffs
 * the actual bytes. Returns the public path to store on the product, never a
 * filesystem path.
 */
export const dynamic = "force-dynamic";

const ALLOWED = ["ADMIN", "SUPER_ADMIN"];

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ALLOWED.includes(user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Няма избран файл." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const result = validateProductImageUpload({
    size: file.size,
    mimeType: file.type,
    filename: file.name,
    bytes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 422 });
  }

  try {
    const publicPath = await saveProductImage(bytes, result.extension);
    return NextResponse.json({ ok: true, path: publicPath }, { status: 201 });
  } catch {
    // Never leak the underlying filesystem error (path, errno, etc.) to the client.
    return NextResponse.json(
      { error: "Качването е неуспешно. Опитайте отново." },
      { status: 500 }
    );
  }
}
