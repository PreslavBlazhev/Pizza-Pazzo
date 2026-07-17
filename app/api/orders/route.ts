import { NextResponse } from "next/server";

/**
 * Orders API (placeholder).
 * GET  — will list orders (admin) / customer's own orders.
 * POST — will create an order from the cart at checkout (Stage 4).
 * No database is connected yet; these return stubs.
 */

export async function GET() {
  return NextResponse.json({ ok: true, orders: [], note: "Placeholder — Stage 4/5." });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(
    { ok: true, note: "Placeholder — order creation not implemented yet.", received: body },
    { status: 201 }
  );
}
