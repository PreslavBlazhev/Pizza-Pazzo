import { NextResponse } from "next/server";

/**
 * Print API — intentionally NOT implemented.
 *
 * v1 printing is the browser print page (/admin/orders/[id]/print, 80mm
 * template — see docs/printing-plan.md). This endpoint is reserved for a
 * future network/agent-based auto-print (Stage 7+); until then it answers
 * honestly instead of returning a fake success.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Print API is not enabled. Use the browser print page (/admin/orders/[id]/print).",
    },
    { status: 501 }
  );
}
