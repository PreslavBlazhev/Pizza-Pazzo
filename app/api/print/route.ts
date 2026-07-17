import { NextResponse } from "next/server";

/**
 * Print API (placeholder).
 * The v1 print flow uses a browser print page (see docs/printing-plan.md), so
 * this endpoint is a stub for a future network/agent-based auto-print (Stage 7+).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    ok: true,
    note: "Placeholder — direct printing not implemented; use the browser print page.",
    received: body,
  });
}
