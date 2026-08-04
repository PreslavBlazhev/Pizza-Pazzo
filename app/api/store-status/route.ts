import { NextResponse } from "next/server";
import { getStoreStatus } from "@/lib/store-status";

/**
 * Public: is the restaurant taking orders?
 *
 * The customer-facing pages are largely prerendered, so the closed dialog
 * cannot be baked into the HTML — it would show whatever was true at build
 * time. Every visitor's browser asks here instead, which also lets a tab left
 * open see the shop reopen without a reload.
 *
 * Nothing sensitive is exposed: the response says only whether orders are
 * accepted and when they resume. Never authenticated, never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getStoreStatus();

  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
