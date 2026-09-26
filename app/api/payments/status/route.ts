import { NextResponse, type NextRequest } from "next/server";
import { getCustomerPaymentView } from "@/lib/payments/customer";

/**
 * GET /api/payments/status?t=… — polled by the "checking" and "pending"
 * pages. Re-checks with the provider (at most every 2 s per attempt) and
 * answers with a coarse state only: no amounts, no personal data, no
 * provider details.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const view = await getCustomerPaymentView(token, { refresh: true, refreshIntervalMs: 2000 });
  if (!view) {
    return NextResponse.json({ state: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { state: view.state, orderNumber: view.order.orderNumber },
    { headers: { "Cache-Control": "no-store" } }
  );
}
