/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 *
 * The 22:30 purge is caught up here: after a restart, a deploy, or a night
 * the service was down, expired orders are deleted before the first request
 * is served (lib/order-purge.ts). Errors are logged, never thrown — a failed
 * purge must not keep the shop from opening; the retention filter in
 * lib/db.ts keeps expired orders invisible regardless.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { maybePurgeExpiredOrders } = await import("@/lib/order-purge");
    await maybePurgeExpiredOrders();
  } catch (err) {
    console.error("[retention] purge at start failed:", (err as Error).message);
  }
}
