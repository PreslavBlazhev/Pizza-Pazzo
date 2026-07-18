import { NextResponse } from "next/server";

/**
 * Orders API — intentionally NOT implemented.
 *
 * Checkout creates orders through the `createOrder` server action
 * (app/actions/checkout.ts) and the admin reads them through server
 * components; there is no REST surface, and a public one would only add
 * attack surface. This stub exists so the URL answers honestly instead of
 * pretending to work. Remove it entirely if a future integration never
 * materialises.
 */

const NOT_ENABLED = {
  ok: false,
  error: "Orders API is not enabled. Checkout uses server actions.",
} as const;

export async function GET() {
  return NextResponse.json(NOT_ENABLED, { status: 501 });
}

export async function POST() {
  return NextResponse.json(NOT_ENABLED, { status: 501 });
}
