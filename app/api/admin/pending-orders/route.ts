import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPendingOrders } from "@/lib/orders";

/**
 * Pending orders for the live board (`/admin/orders/live`), which polls this
 * every few seconds. Staff+. The middleware skips /api entirely, so the role
 * check here is the only guard.
 */
export const dynamic = "force-dynamic";

const ALLOWED = ["STAFF", "ADMIN", "SUPER_ADMIN"];

export async function GET() {
  const user = await getSessionUser();
  if (!user || !ALLOWED.includes(user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orders = await getPendingOrders();
  return NextResponse.json(
    { orders, serverTime: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
