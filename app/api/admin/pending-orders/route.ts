import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPendingOrders } from "@/lib/orders";
import { getPrintTemplates } from "@/lib/print-templates";
import { getStoreStatus } from "@/lib/store-status";

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

  // Templates ride along with every poll so a layout edit reaches the kitchen
  // tablet within one interval — the board can stay open for a whole shift.
  //
  // So does the open/closed state: that is what makes a timed closure resume
  // the board by itself. Nobody writes anything when the timer expires; the
  // next poll simply comes back with `isOpen: true`.
  const [orders, printTemplates, storeStatus] = await Promise.all([
    getPendingOrders(),
    getPrintTemplates(),
    getStoreStatus(),
  ]);
  return NextResponse.json(
    { orders, printTemplates, storeStatus, serverTime: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
