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
 *     (pp-accepted-<order id>), so a re-send after a timeout or a crash —
 *     when the first attempt MAY have gone — is recognised by Resend instead
 *     of delivered twice. Resend remembers a key for 24 HOURS only, and the
 *     order history is now kept, so a job can outlive it (an outage, a
 *     process down for a day).
 *
 * THE SAFE RETRY WINDOW. The first claim stores firstAttemptAt and
 * safeRetryUntil = firstAttemptAt + SAFE_AUTO_RETRY_MS (23 h: one hour of
 * margin before Resend forgets the key). Every attempt whose outcome is
 * UNCLEAR — a timeout, a network error, a 5xx, a thrown error, a worker that
 * died mid-send (an expired SENDING lease) — sets ambiguousAttempt. After
 * safeRetryUntil an unclear job is NOT retried automatically: it becomes
 * NEEDS_REVIEW, keeps every field, and the kitchen sees "НУЖНА Е ПРОВЕРКА".
 * Nothing is deleted and an unconfirmed send is never marked as accepted. A
 * job whose every failed attempt was a PROVEN refusal (rate limit or quota:
 * Resend did not take it) may still be retried — it cannot have been
 * delivered. Retries exhausted after an unclear attempt also end in
 * NEEDS_REVIEW, never in "НЕ Е ИЗПРАТЕН", which would be a guess.
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

/** Resend keeps an idempotency key for 24 h; automatic retries of an unclear attempt stop 1 h earlier. */
export const RESEND_IDEMPOTENCY_WINDOW_MS = 24 * 3600_000;
export const SAFE_AUTO_RETRY_MS = RESEND_IDEMPOTENCY_WINDOW_MS - 3600_000;

/** What staff read on a job that needs a person (no secrets, no customer data). */
export const NEEDS_REVIEW_REASON =
  "Неясно дали Resend е приел писмото, а 24-часовата защита срещу двойно изпращане изтече — няма автоматичен нов опит.";

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
  /** Jobs moved to NEEDS_REVIEW instead of an unsafe automatic retry. */
  review: number;
}

/**
 * Delivers due outbox rows. Safe to call concurrently from any number of
 * requests/processes (see the claim). Never throws.
 */
export async function drainEmailOutbox(
  options: { limit?: number; orderId?: string; send?: AcceptedEmailSender; now?: Date } = {}
): Promise<DrainSummary> {
  const send = options.send ?? sendCustomerOrderAcceptedEmail;
  const summary: DrainSummary = { claimed: 0, accepted: 0, retrying: 0, failed: 0, skipped: 0, review: 0 };
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
      select: {
        id: true,
        orderId: true,
        status: true,
        attempts: true,
        createdAt: true,
        firstAttemptAt: true,
        safeRetryUntil: true,
        ambiguousAttempt: true,
      },
    });

    for (const job of due) {
      // The safe window, fixed at the FIRST attempt and stored. A row from
      // before the column existed counts from its creation (never later
      // than the real first attempt — conservative).
      const firstAttemptAt = job.firstAttemptAt ?? (job.attempts > 0 ? job.createdAt : now);
      const safeRetryUntil = job.safeRetryUntil ?? new Date(firstAttemptAt.getTime() + SAFE_AUTO_RETRY_MS);
      // A SENDING row whose lease ran out: its worker died mid-send, so
      // Resend may or may not have taken the message.
      const ambiguous = job.ambiguousAttempt || job.status === "SENDING";
      const lastClaim = { id: job.id, status: job.status, attempts: job.attempts };

      if (job.attempts > 0 && ambiguous && now.getTime() >= safeRetryUntil.getTime()) {
        // Unsafe to retry: Resend may have forgotten the idempotency key, so a
        // retry could deliver a second e-mail. Keep the job, ask a person.
        const { count } = await db.emailOutbox.updateMany({
          where: lastClaim,
          data: {
            status: "NEEDS_REVIEW",
            ambiguousAttempt: true,
            firstAttemptAt,
            safeRetryUntil,
            lastError: NEEDS_REVIEW_REASON,
            lastErrorKind: "UNCERTAIN",
          },
        });
        if (count === 1) summary.review++;
        continue;
      }

      // The claim: only the worker whose UPDATE matches the row as it was
      // read gets it. A second worker reading the same row matches nothing.
      const { count } = await db.emailOutbox.updateMany({
        where: lastClaim,
        data: {
          status: "SENDING",
          claimedAt: now,
          attempts: { increment: 1 },
          firstAttemptAt,
          safeRetryUntil,
          ...(ambiguous ? { ambiguousAttempt: true } : {}),
        },
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
        // A TEMPORARY failure is unclear unless the answer proves Resend did
        // not take the message (rate limit, quota). PERMANENT and CONFIG are
        // explicit refusals.
        const unclear = ambiguous || (kind === "TEMPORARY" && !outcome.notSent);
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
        const nextAttemptAt = new Date(now.getTime() + delay);
        const wantsRetry = kind === "TEMPORARY" && attempt < MAX_ATTEMPTS;
        // A retry of an unclear job must still fall inside the safe window.
        const retry = wantsRetry && !(unclear && nextAttemptAt.getTime() >= safeRetryUntil.getTime());
        // Not retried, but this or an earlier attempt may have gone: that is
        // not "НЕ Е ИЗПРАТЕН" — a person checks.
        const review = !retry && unclear;
        const error = outcome.error.slice(0, 300);
        await db.emailOutbox.updateMany({
          where: lease,
          data: {
            ambiguousAttempt: unclear,
            ...(retry
              ? { status: "RETRY", nextAttemptAt, lastError: error, lastErrorKind: kind }
              : review
                ? {
                    status: "NEEDS_REVIEW",
                    lastError: `${NEEDS_REVIEW_REASON} Последна грешка: ${error}`.slice(0, 300),
                    lastErrorKind: "UNCERTAIN",
                  }
                : { status: "FAILED", lastError: error, lastErrorKind: kind }),
          },
        });
        if (retry) summary.retrying++;
        else if (review) summary.review++;
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

