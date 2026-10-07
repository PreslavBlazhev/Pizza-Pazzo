import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPendingOrders } from "@/lib/orders";
import { getPrintTemplates } from "@/lib/print-templates";
import { getStoreStatus } from "@/lib/store-status";
import { retryFailedNotifications } from "@/lib/payments/service";
import { reconcileOpenPayments } from "@/lib/payments/reconcile";
import { getPaymentAttention } from "@/lib/payments/admin";

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
  // A restaurant e-mail that failed (Resend down, a bad moment) is retried
  // here, on the board's own rhythm — bounded and never duplicated (see
  // notifyRestaurantOnce). Never allowed to break the poll itself.
  await retryFailedNotifications().catch((err) =>
    console.error("[email] notification retry failed:", (err as Error).message)
  );
  // Card payments nobody is watching any more are re-checked here too, a few
  // per poll, with per-attempt backoff (lib/payments/reconcile.ts).
  await reconcileOpenPayments({ limit: 3 }).catch((err) =>
    console.error("[payments] reconcile on poll failed:", (err as Error).message)
  );

  const [orders, printTemplates, storeStatus, paymentAttention] = await Promise.all([
    getPendingOrders(),
    getPrintTemplates(),
    getStoreStatus(),
    getPaymentAttention(),
  ]);
  return NextResponse.json(
    { orders, printTemplates, storeStatus, paymentAttention, serverTime: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
