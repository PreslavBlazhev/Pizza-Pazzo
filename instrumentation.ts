/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 *
 * The daily 22:30 retention is SWITCHED OFF — the order history is kept
 * (lib/order-retention.ts ORDER_RETENTION_ENABLED = false). So a start, a
 * restart or a deploy deletes nothing and arms no timer: this returns at
 * once. (lib/order-purge.ts is switched off on its own as well.)
 *
 * Kept for the dormant design: when the retention is ON, the purge is caught
 * up at start and the in-process 22:30 timer is armed. Errors are logged,
 * never thrown — a failed purge must not keep the shop from opening.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Card payments: unclear payments and our NOTIFY answers are checked with
  // the bank every minute, with nobody on the site (lib/payments/background.ts).
  try {
    const { startPaymentBackgroundJobs } = await import("@/lib/payments/background");
    if (startPaymentBackgroundJobs()) console.log("[payments] background checks armed (every 60 s)");
  } catch (err) {
    console.error("[payments] background checks not armed:", (err as Error).message);
  }
  const { orderRetentionEnabled } = await import("@/lib/order-retention");
  if (!orderRetentionEnabled()) return;
  try {
    const { maybePurgeExpiredOrders, scheduleCutoffPurge } = await import("@/lib/order-purge");
    scheduleCutoffPurge();
    await maybePurgeExpiredOrders(undefined, "start");
  } catch (err) {
    console.error("[retention] purge at start failed:", (err as Error).message);
  }
}
