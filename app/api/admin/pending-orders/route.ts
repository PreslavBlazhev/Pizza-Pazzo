import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getActiveOrders, getPendingOrders } from "@/lib/orders";
import { getPrintTemplates } from "@/lib/print-templates";
import { getStoreStatus } from "@/lib/store-status";
import { retryFailedNotifications } from "@/lib/payments/service";
import { reconcileOpenPayments } from "@/lib/payments/reconcile";
import { getPaymentAttention } from "@/lib/payments/admin";
import { drainEmailOutbox, emailJobsFor } from "@/lib/email/outbox";
import { maybePurgeExpiredOrders } from "@/lib/order-purge";
import { nextCutoffAfter, retentionNow } from "@/lib/order-retention";

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
  //
  // Background work rides on the poll too, each step bounded and never
  // allowed to break it: the 22:30 purge when this process has not done it
  // yet (lib/order-purge.ts), the customer e-mail outbox, the restaurant
  // e-mail retries and the card payments nobody is watching any more.
  await maybePurgeExpiredOrders();
  await drainEmailOutbox({ limit: 3 });
  await retryFailedNotifications().catch((err) =>
    console.error("[email] notification retry failed:", (err as Error).message)
  );
  await reconcileOpenPayments({ limit: 3 }).catch((err) =>
    console.error("[payments] reconcile on poll failed:", (err as Error).message)
  );

  const [orders, activeOrders, printTemplates, storeStatus, paymentAttention] = await Promise.all([
    getPendingOrders(),
    getActiveOrders(),
    getPrintTemplates(),
    getStoreStatus(),
    getPaymentAttention(),
  ]);
  const emailJobs = await emailJobsFor(activeOrders.map((o) => o.id));
  const now = retentionNow();
  return NextResponse.json(
    {
      orders,
      activeOrders,
      emailJobs,
      printTemplates,
      storeStatus,
      paymentAttention,
      serverTime: now.toISOString(),
      // The board clears itself at this instant even if a poll is late.
      cutoffAt: nextCutoffAfter(now).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
