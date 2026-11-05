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
 * confirm, and it never refunds or releases an order on its own. The one
 * thing it closes by itself is an ABANDONED card payment (see
 * closeAbandonedAttempt): a fresh signed status query still says the bank
 * has no transaction at all for the order — no money exists, so the unpaid
 * order is cancelled instead of "waiting for payment" for ever.
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
import { anonymiseIfPending } from "@/lib/privacy";
import { syncAttempt } from "./service";
import { isOpenAttempt, OPEN_ATTEMPT_STATUSES, orderPaymentStatusFor, PAYMENT_ALERTS } from "./status";

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
/**
 * An attempt WE declared expired (the gateway had not registered it within
 * the session lifetime — UPC's SESSION_TIMEOUT) is still re-checked for this
 * long: if the customer paid that very page anyway and the NOTIFY never got
 * through, the money is found and handed to a person (LATE_CONFIRMATION).
 */
export const EXPIRED_RECHECK_MS = 24 * 60 * 60 * 1000;
export const SESSION_TIMEOUT = "SESSION_TIMEOUT";
/**
 * A card payment the customer abandoned: this long after the attempt was
 * created, the bank STILL has no transaction for it (UPC TranCode 408
 * "Transaction not found" — the payment form was never submitted). UPC's
 * signed request does not expire at the gateway (probe 05.11.2026: a request
 * with a 3-day-old PurchaseTime still opened the payment page), so the site
 * has to close it. A customer who pays that old page anyway is handled like
 * any late payment: the NOTIFY for a cancelled order is answered "reverse"
 * and the cancellation is confirmed with the bank (upc/verify.ts); without a
 * NOTIFY the status re-check (EXPIRED_RECHECK_MS) finds the money and holds
 * the order for staff (PAID_AFTER_CANCEL) — never cooked, never counted twice.
 */
export const ABANDONED_AFTER_MS = 60 * 60 * 1000;

/** The last status query said the gateway has no transaction under this OrderID. */
function bankHasNoTransaction(a: { providerResponse: string | null }): boolean {
  try {
    return JSON.parse(a.providerResponse ?? "{}").notFound === true;
  } catch {
    return false;
  }
}

/**
 * Closes one abandoned attempt. The caller has JUST queried the bank and got
 * "not found". Only while the attempt is still open and no NOTIFY decision
 * exists for it, and only for the order's latest attempt. The order is
 * cancelled only while it is unpaid, still waiting (PENDING) and never
 * released to the kitchen.
 */
export async function closeAbandonedAttempt(
  attempt: { id: string; orderId: string; reference: string },
  now: Date = new Date()
): Promise<boolean> {
  const latest = await db.paymentAttempt.findFirst({
    where: { orderId: attempt.orderId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest?.id !== attempt.id) return false;
  const closed = await db.$transaction(async (tx) => {
    const moved = await tx.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { in: [...OPEN_ATTEMPT_STATUSES] }, notifyAction: null },
      data: { status: "EXPIRED", failureReason: SESSION_TIMEOUT, finalizedAt: now },
    });
    if (moved.count !== 1) return false;
    const unpaid = { id: attempt.orderId, paymentMethod: "CARD_ONLINE", paymentStatus: { not: "PAID" } };
    // The payment is settled as "expired" — also on an order staff already
    // cancelled by hand; the "bank does not answer" alert no longer applies.
    await tx.order.updateMany({ where: unpaid, data: { paymentStatus: orderPaymentStatusFor("EXPIRED") } });
    await tx.order.updateMany({
      where: { ...unpaid, paymentAlert: PAYMENT_ALERTS.UNRESOLVED_PAYMENT },
      data: { paymentAlert: null, paymentAlertAckAt: null, paymentAlertAckBy: null },
    });
    // A still-waiting order that never reached the kitchen is cancelled.
    await tx.order.updateMany({
      where: { ...unpaid, status: "PENDING", releasedToKitchenAt: null },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    return true;
  });
  if (closed) {
    await anonymiseIfPending(attempt.orderId);
    console.warn(
      `[payments] ${attempt.reference} abandoned (bank: no transaction) → attempt expired, unpaid order cancelled`
    );
  }
  return closed;
}

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
  /** Abandoned payments closed (attempt EXPIRED, unpaid order cancelled). */
  abandoned: number;
}

export async function reconcileOpenPayments(
  options: { limit?: number; now?: Date } = {}
): Promise<ReconcileSummary> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));

  const candidates = await db.paymentAttempt.findMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
      OR: [
        {
          status: { in: [...OPEN_ATTEMPT_STATUSES] },
          createdAt: { gt: new Date(now.getTime() - RECONCILE_MAX_AGE_MS) },
        },
        {
          status: "EXPIRED",
          failureReason: SESSION_TIMEOUT,
          createdAt: { gt: new Date(now.getTime() - EXPIRED_RECHECK_MS) },
        },
      ],
    },
    // Never-checked first, then the longest-unchecked.
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: limit * 3,
  });

  const summary: ReconcileSummary = { checked: 0, settled: 0, flagged: 0, abandoned: 0 };
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
    if (!isOpenAttempt(a.status)) continue; // an expired one re-checked: nothing more to do
    if (after && !isOpenAttempt(after.status)) {
      summary.settled++;
      continue;
    }

    if (after && age > ABANDONED_AFTER_MS && bankHasNoTransaction(after)) {
      if (await closeAbandonedAttempt(after, now)) {
        summary.abandoned++;
        continue;
      }
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
  summary.abandoned += await closeFailedUnpaidOrders(now);
  return summary;
}

/**
 * Card orders whose LATEST attempt ended without money — declined (105, 116 …),
 * page closed (601), cancelled — and that nobody retried for
 * ABANDONED_AFTER_MS: the unpaid order is cancelled instead of "waiting for
 * payment" for ever. The bank's answer was already final for that attempt, so
 * no query is needed; money that still arrives later is a late payment
 * (reverse on NOTIFY / PAID_AFTER_CANCEL for staff), never cooked.
 */
async function closeFailedUnpaidOrders(now: Date): Promise<number> {
  const before = new Date(now.getTime() - ABANDONED_AFTER_MS);
  const orders = await db.order.findMany({
    where: {
      paymentMethod: "CARD_ONLINE",
      paymentStatus: { in: ["FAILED", "CANCELLED", "EXPIRED"] },
      status: "PENDING",
      releasedToKitchenAt: null,
      createdAt: { lt: before },
    },
    select: { id: true, orderNumber: true },
    take: 20,
  });
  let closed = 0;
  for (const o of orders) {
    const latest = await db.paymentAttempt.findFirst({
      where: { orderId: o.id },
      orderBy: { createdAt: "desc" },
      select: { status: true, finalizedAt: true, createdAt: true },
    });
    if (!latest || isOpenAttempt(latest.status) || latest.status === "PAID") continue;
    if ((latest.finalizedAt ?? latest.createdAt) > before) continue; // the customer may still retry
    const { count } = await db.order.updateMany({
      where: { id: o.id, status: "PENDING", paymentStatus: { in: ["FAILED", "CANCELLED", "EXPIRED"] }, releasedToKitchenAt: null },
      data: { status: "CANCELLED", cancelledAt: now, paymentAlert: null, paymentAlertAckAt: null, paymentAlertAckBy: null },
    });
    if (count === 1) {
      closed++;
      await anonymiseIfPending(o.id);
      console.warn(`[payments] order #${o.orderNumber}: card payment failed and was not retried → unpaid order cancelled`);
    }
  }
  return closed;
}
