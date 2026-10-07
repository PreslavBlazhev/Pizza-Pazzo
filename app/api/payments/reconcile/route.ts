import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { reconcileOpenPayments } from "@/lib/payments/reconcile";
import { clientIp, PAYMENT_RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/payments/reconcile — re-checks unconfirmed card payments with the
 * provider (lib/payments/reconcile.ts). For a Render Cron Job or any external
 * scheduler, e.g. every 5 minutes:
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $PAYMENT_RECONCILE_SECRET" \
 *        https://<домейн>/api/payments/reconcile
 *
 * Fail-closed: without PAYMENT_RECONCILE_SECRET (≥ 32 characters) the
 * endpoint does not exist (404). It only ever runs the same server-to-server
 * status checks as the customer's page; it cannot mark anything paid.
 */
export const dynamic = "force-dynamic";

const MIN_SECRET = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export async function POST(request: NextRequest) {
  const secret = (process.env.PAYMENT_RECONCILE_SECRET ?? "").trim();
  if (secret.length < MIN_SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!rateLimit(`pay-reconcile:ip:${clientIp(request.headers)}`, PAYMENT_RATE_LIMITS.reconcilePerIp)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Compare fixed-length digests: no early exit, no length leak.
  if (!given || !timingSafeEqual(digest(given), digest(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await reconcileOpenPayments({ limit: 25 });
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
