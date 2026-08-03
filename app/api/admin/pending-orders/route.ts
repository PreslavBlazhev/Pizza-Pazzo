import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPendingOrders } from "@/lib/orders";
import { getPrintTemplates } from "@/lib/print-templates";

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
  const [orders, printTemplates] = await Promise.all([
    getPendingOrders(),
    getPrintTemplates(),
  ]);
  return NextResponse.json(
    { orders, printTemplates, serverTime: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
