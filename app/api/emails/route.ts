import { NextResponse } from "next/server";

/**
 * Emails API (placeholder).
 * POST — will trigger transactional emails (order accepted/cancelled) in
 * Stage 6. No email provider is connected yet; this only echoes the payload.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    ok: true,
    note: "Placeholder — no email is actually sent yet (Stage 6).",
    received: body,
  });
}
