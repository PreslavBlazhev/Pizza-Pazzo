/**
 * Customer e-mail outbox — SERVER ONLY.
 *
 * "Приеми" must never depend on the e-mail: the order is accepted even when
 * Resend is down. So the e-mail is not sent INSIDE the accept; an outbox row
 * is written in the same database transaction as the status change
 * (lib/order-workflow.ts), and this module delivers it:
 *
 *   - right after the accept (Next `after()`), so the customer is not kept
 *     waiting for a cron tick;
 *   - on every kitchen poll and every maintenance run, for retries and for
 *     a process that died between the commit and the send.
 *
 * EXACTLY-ONCE, as far as we control it:
 *   - one row per order and kind (`dedupeKey` is UNIQUE) — a second "Приеми",
 *     two tablets, a retried request: still one row;
 *   - a worker claims a row with a conditional UPDATE (status + attempts as
 *     they were read). Two workers can never both own an attempt;
 *   - a claim is a lease (SENDING + claimedAt). A worker that dies leaves a
 *     SENDING row whose lease runs out; the next worker re-sends it;
 *   - every attempt for one order uses the SAME Resend idempotency key
 *     (pp-accepted-<order id>, 24 h window — longer than an order lives), so
 *     a re-send after a timeout or a crash — when the first attempt MAY have
 *     gone — is recognised by Resend instead of delivered twice.
 *
 * RETRIES: only TEMPORARY failures (rate limit, 5xx, network, timeout), at
 * most MAX_ATTEMPTS, with growing waits. PERMANENT (bad address) and CONFIG
 * (API key, unverified sender, the resend.dev test sender) stop at once and
 * are shown to the kitchen as such.
 *
 * WHAT A STATUS MEANS. PROVIDER_ACCEPTED = Resend accepted the message for
 * delivery. It does NOT mean it reached the customer's inbox (or even their
 * mail server) — no webhook is configured, so the site knows nothing beyond
 * Resend's acceptance, and says exactly that.
 *
 * EXPIRY: the row belongs to its order (onDelete: Cascade) and to the
 * retention filter in lib/db.ts — at 22:30 a pending retry simply finds
 * nothing to send, and the purge deletes it with the order. (Dormant: the
 * retention is switched off and the history is kept — lib/order-retention.ts.)
 */
import { db, type DbTransaction } from "@/lib/db";
import { getOrderById } from "@/lib/orders";
import { isOrderLive, orderRetentionEnabled, retentionNow } from "@/lib/order-retention";
import { trackingUrlFor } from "@/lib/order-tracking";
import { sendCustomerOrderAcceptedEmail, type EmailOutcome } from "@/lib/email/resend";
import type { OrderWithItems } from "@/types/order";
import {
  EMAIL_JOB_STATUSES,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  type EmailJobStatus,
  type EmailJobView,
} from "@/lib/email/outbox-status";

export { EMAIL_JOB_STATUSES, MAX_ATTEMPTS, RETRY_DELAYS_MS, type EmailJobStatus, type EmailJobView };

export const EMAIL_KIND_ACCEPTED = "ORDER_ACCEPTED";

/** A SENDING row older than this belonged to a worker that died. */
export const SENDING_LEASE_MS = 120_000;

export function dedupeKeyFor(kind: string, orderId: string): string {
  return `${kind}:${orderId}`;
}

/** The Resend idempotency key — the same for every attempt of one e-mail. */
export function providerIdempotencyKey(orderId: string): string {
  return `pp-accepted-${orderId}`;
}

/**
 * Queues the "accepted" e-mail inside the caller's transaction. Idempotent:
 * the second call for the same order finds the row and does nothing.
 */
export async function enqueueAcceptedEmail(tx: DbTransaction, orderId: string): Promise<boolean> {
  const dedupeKey = dedupeKeyFor(EMAIL_KIND_ACCEPTED, orderId);
  const existing = await tx.emailOutbox.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) return false;
  await tx.emailOutbox.create({
    data: { orderId, kind: EMAIL_KIND_ACCEPTED, dedupeKey, status: "PENDING", nextAttemptAt: new Date(0) },
  });
  return true;
}

/** The sender, injectable so tests never reach Resend. */
export type AcceptedEmailSender = (
  order: OrderWithItems,
  options: { idempotencyKey: string; trackingUrl: string | null }
) => Promise<EmailOutcome>;

export interface DrainSummary {
  claimed: number;
  accepted: number;
  retrying: number;
  failed: number;
  skipped: number;
}

/**
 * Delivers due outbox rows. Safe to call concurrently from any number of
 * requests/processes (see the claim). Never throws.
 */
export async function drainEmailOutbox(
  options: { limit?: number; orderId?: string; send?: AcceptedEmailSender; now?: Date } = {}
): Promise<DrainSummary> {
  const send = options.send ?? sendCustomerOrderAcceptedEmail;
  const summary: DrainSummary = { claimed: 0, accepted: 0, retrying: 0, failed: 0, skipped: 0 };
  try {
    const now = options.now ?? retentionNow();
    const due = await db.emailOutbox.findMany({
      where: {
        ...(options.orderId ? { orderId: options.orderId } : {}),
        OR: [
          { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } },
          { status: "SENDING", claimedAt: { lt: new Date(now.getTime() - SENDING_LEASE_MS) } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: options.limit ?? 5,
      select: { id: true, orderId: true, status: true, attempts: true },
    });

    for (const job of due) {
      // The claim: only the worker whose UPDATE matches the row as it was
      // read gets it. A second worker reading the same row matches nothing.
      const { count } = await db.emailOutbox.updateMany({
        where: { id: job.id, status: job.status, attempts: job.attempts },
        data: { status: "SENDING", claimedAt: now, attempts: { increment: 1 } },
      });
      if (count !== 1) continue;
      summary.claimed++;
      const attempt = job.attempts + 1;

      const order = await getOrderById(job.orderId);
      // The history is kept (lib/order-retention.ts): a retry never deletes
      // anything. An order that cannot be read is recorded as SKIPPED.
      if (!order || !order.items) {
        await db.emailOutbox
          .updateMany({ where: { id: job.id }, data: { status: "SKIPPED", lastError: "order not found", lastErrorKind: null } })
          .catch(() => undefined);
        summary.skipped++;
        continue;
      }
      // Dormant design only (retention ON): an expired order is not e-mailed.
      if (orderRetentionEnabled() && !isOrderLive(new Date(order.createdAt), retentionNow())) {
        await db.emailOutbox.deleteMany({ where: { id: job.id } }).catch(() => undefined);
        summary.skipped++;
        continue;
      }

      let outcome: EmailOutcome;
      try {
        outcome = await send(
          { ...order, items: order.items },
          {
            idempotencyKey: providerIdempotencyKey(order.id),
            trackingUrl: trackingUrlFor(order.id),
          }
        );
      } catch (err) {
        outcome = { status: "failed", error: String((err as Error).message ?? err).slice(0, 300), kind: "TEMPORARY" };
      }

      // Every write below is conditional on our lease, and is filtered by the
      // retention scope: if the order expired meanwhile, it touches nothing.
      const lease = { id: job.id, status: "SENDING", claimedAt: now };
      if (outcome.status === "sent") {
        await db.emailOutbox.updateMany({
          where: lease,
          data: {
            status: "PROVIDER_ACCEPTED",
            sentAt: new Date(),
            providerMessageId: outcome.id ?? null,
            lastError: null,
            lastErrorKind: null,
          },
        });
        summary.accepted++;
      } else if (outcome.status === "skipped") {
        await db.emailOutbox.updateMany({
          where: lease,
          data: { status: "SKIPPED", lastError: outcome.reason.slice(0, 300), lastErrorKind: null },
        });
        summary.skipped++;
      } else {
        const kind = outcome.kind ?? "TEMPORARY";
        const retry = kind === "TEMPORARY" && attempt < MAX_ATTEMPTS;
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
        await db.emailOutbox.updateMany({
          where: lease,
          data: retry
            ? {
                status: "RETRY",
                nextAttemptAt: new Date(now.getTime() + delay),
                lastError: outcome.error.slice(0, 300),
                lastErrorKind: kind,
              }
            : { status: "FAILED", lastError: outcome.error.slice(0, 300), lastErrorKind: kind },
        });
        if (retry) summary.retrying++;
        else summary.failed++;
      }
    }
  } catch (err) {
    console.error("[email] outbox drain failed:", (err as Error).message);
  }
  return summary;
}

export async function emailJobsFor(orderIds: readonly string[]): Promise<Record<string, EmailJobView>> {
  if (orderIds.length === 0) return {};
  const rows = await db.emailOutbox.findMany({
    where: { orderId: { in: [...orderIds] }, kind: EMAIL_KIND_ACCEPTED },
    select: { orderId: true, status: true, attempts: true, lastError: true, lastErrorKind: true, nextAttemptAt: true },
  });
  return Object.fromEntries(
    rows.map((r) => [
      r.orderId,
      {
        status: (EMAIL_JOB_STATUSES as readonly string[]).includes(r.status)
          ? (r.status as EmailJobStatus)
          : "PENDING",
        attempts: r.attempts,
        lastError: r.lastError,
        lastErrorKind: r.lastErrorKind,
        nextAttemptAt: r.status === "RETRY" ? r.nextAttemptAt.toISOString() : null,
      },
    ])
  );
}

