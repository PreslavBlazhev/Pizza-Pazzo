/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 *
 * - The purge is caught up at once: after a restart, a deploy or a night the
 *   service was down, expired orders are deleted before the shift starts.
 * - The in-process 22:30 timer is armed (lib/order-purge.ts
 *   scheduleCutoffPurge) — the deletion at 22:30:01 while this process is up.
 *   The scheduler's calls (render.yaml) cover a process that is not.
 *
 * Errors are logged and recorded, never thrown — a failed purge must not keep
 * the shop from opening; lib/db.ts keeps expired orders invisible regardless.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { maybePurgeExpiredOrders, scheduleCutoffPurge } = await import("@/lib/order-purge");
    scheduleCutoffPurge();
    await maybePurgeExpiredOrders(undefined, "start");
  } catch (err) {
    console.error("[retention] purge at start failed:", (err as Error).message);
  }
}
