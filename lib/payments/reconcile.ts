/**
 * Reconciliation of card payments nobody is looking at — SERVER ONLY.
 *
 * Normally a payment settles because someone asks: the customer's "checking"
 * page, the provider's callback, the staff's "Провери" button. Reconciliation
 * covers the attempts where nobody asks any more — the customer closed the
 * tab, the callback never came, a session creation timed out — so that money
 * which did arrive is found, and the order's state matches the bank's.
 *
 * It is the same server-to-server status check (syncAttempt) on a schedule,
 * nothing more: it cannot mark anything paid that the provider did not
 * confirm, and it never cancels, refunds or releases an order on its own.
 *
 * How it runs on Render (one web service, no worker):
 *   - every live-board poll calls it with a small batch (the board is open
 *     whenever the restaurant works);
 *   - POST /api/payments/reconcile with the PAYMENT_RECONCILE_SECRET bearer
 *     token, for a Render Cron Job or any external scheduler, covers the hours
 *     when no board is open.
 * Both are bounded and back off per attempt, so neither can hammer the bank.
 */
import { db } from "@/lib/db";
import { syncAttempt } from "./service";
import { isOpenAttempt, OPEN_ATTEMPT_STATUSES, PAYMENT_ALERTS } from "./status";

/** Younger attempts belong to the customer's own page and the callback. */
export const RECONCILE_MIN_AGE_MS = 60_000;
/**
 * After this long without a final answer a human is asked to look. A bank's
 * hosted session lasts minutes, so two hours of "pending" is not normal.
 * Technical threshold only — nothing is decided on it, it raises an alert.
 */
export const UNRESOLVED_AFTER_MS = 2 * 60 * 60 * 1000;
/** Older than this, an attempt is left to staff and the bank panel. */
export const RECONCILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** How long to wait between two checks of one attempt, by its age. */
export function reconcileBackoffMs(ageMs: number): number {
  if (ageMs < 10 * 60_000) return 30_000;
  if (ageMs < 60 * 60_000) return 2 * 60_000;
  if (ageMs < 24 * 60 * 60_000) return 15 * 60_000;
  return 60 * 60_000;
}

export interface ReconcileSummary {
  checked: number;
  /** Attempts that left the open states during this run. */
  settled: number;
  /** Orders newly flagged UNRESOLVED_PAYMENT for staff. */
  flagged: number;
}

export async function reconcileOpenPayments(
  options: { limit?: number; now?: Date } = {}
): Promise<ReconcileSummary> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));

  const candidates = await db.paymentAttempt.findMany({
    where: {
      status: { in: [...OPEN_ATTEMPT_STATUSES] },
      createdAt: {
        lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS),
        gt: new Date(now.getTime() - RECONCILE_MAX_AGE_MS),
      },
    },
    // Never-checked first, then the longest-unchecked.
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: limit * 3,
  });

  const summary: ReconcileSummary = { checked: 0, settled: 0, flagged: 0 };
  for (const a of candidates) {
    if (summary.checked >= limit) break;
    const age = now.getTime() - a.createdAt.getTime();
    if (a.lastCheckedAt && now.getTime() - a.lastCheckedAt.getTime() < reconcileBackoffMs(age)) continue;

    summary.checked++;
    let after;
    try {
      after = await syncAttempt(a.id, { minIntervalMs: 0 });
    } catch (err) {
      console.warn(`[payments] reconcile ${a.reference} failed: ${(err as Error).message}`);
      continue;
    }
    if (after && !isOpenAttempt(after.status)) {
      summary.settled++;
      continue;
    }

    if (age > UNRESOLVED_AFTER_MS) {
      const { count } = await db.order.updateMany({
        where: { id: a.orderId, paymentStatus: { not: "PAID" }, paymentAlert: null },
        data: { paymentAlert: PAYMENT_ALERTS.UNRESOLVED_PAYMENT, paymentAlertAckAt: null, paymentAlertAckBy: null },
      });
      if (count === 1) {
        summary.flagged++;
        console.warn(`[payments] ${a.reference} still unresolved after ${Math.round(age / 60000)} min — flagged`);
      }
    }
  }
  return summary;
}
