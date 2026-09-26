/**
 * Online card payments — the restaurant side. SERVER ONLY.
 *
 * The flow, and the one rule under all of it:
 *
 *   checkout            Order { CARD_ONLINE, AWAITING_PAYMENT, releasedToKitchenAt: null }
 *   "Плати с карта"     startCardPayment → PaymentAttempt + provider session
 *                       → the customer types the card on the provider's page
 *   return / callback   ONLY trigger syncAttempt, which asks the provider
 *                       server-to-server; nothing the browser sends counts
 *   provider says PAID  (and confirms our exact amount + currency)
 *                       → attempt PAID → order PAID → released to the kitchen
 *                       → restaurant e-mail, exactly once
 *
 * Every state change below is a conditional `updateMany` (… where the row is
 * still in the state we read). SQLite serialises writes, so when two requests
 * race — a double click, the browser return and the bank callback arriving
 * together, a retried callback — exactly one of them wins the transition and
 * the others see count 0 and do nothing. That is what makes "paid twice",
 * "two kitchen tickets" and "two e-mails" impossible rather than unlikely.
 *
 * Nothing in here stores or logs card data or provider credentials.
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseOrderItemExtras } from "@/lib/extras-rules";
import { sendNewOrderNotification } from "@/lib/email/resend";
import { toMinorUnits } from "./money";
import { getProviderForAttempt, getProviderForNewPayment, providerIdFromSlug, providerSlug } from "./providers";
import {
  collectInstructionBg,
  isOpenAttempt,
  isRetryableAttempt,
  orderPaymentStatusFor,
  PAYMENT_ALERTS,
  type AttemptStatus,
} from "./status";
import type { CallbackRequest, StatusResult } from "./types";
import { isPaymentMethod, isPaymentStatus } from "@/types/order";

type AttemptRow = Prisma.PaymentAttemptGetPayload<Record<string, never>>;

/** How long "Pay" holds the per-order lock while it talks to the provider. */
const PAYMENT_LOCK_MS = 30_000;
/** A CREATED attempt with no hosted page this old is a crashed creation. */
const STALE_CREATION_MS = 60_000;
/** Snapshots of provider answers are for diagnosis, not archives. */
const MAX_PROVIDER_RESPONSE = 4000;

export function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Our reference for one attempt, sent to the provider as its order number.
 * Short (banks commonly cap it at 32), unique, and readable in a bank portal:
 * "PP1012-3F9A1C2B" is order 1012.
 */
export function newAttemptReference(orderNumber: number): string {
  return `PP${orderNumber}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function snapshot(details: Record<string, unknown> | undefined): string | null {
  if (!details) return null;
  try {
    return JSON.stringify(details).slice(0, MAX_PROVIDER_RESPONSE);
  } catch {
    return null;
  }
}

// ── Kitchen release + restaurant notification ──────────────────────────────

/**
 * Makes an order visible to the kitchen and tells the restaurant — each at
 * most once in the order's life, whoever calls it and however often.
 * Used by cash checkout (immediately) and card payment (on confirmation).
 */
export async function releaseToKitchenAndNotify(orderId: string): Promise<void> {
  await db.order.updateMany({
    where: { id: orderId, releasedToKitchenAt: null },
    data: { releasedToKitchenAt: new Date() },
  });
  await notifyRestaurantOnce(orderId);
}

/** How many times the restaurant e-mail is attempted before a human must look. */
export const MAX_NOTIFICATION_ATTEMPTS = 5;
/**
 * The attempt lease. While it runs nobody else may send; after it, a FAILED
 * (or crashed SENDING) notification may be tried again.
 */
export const NOTIFICATION_RETRY_AFTER_MS = 60_000;

type NewOrderSender = typeof sendNewOrderNotification;

/**
 * Sends the restaurant's "new order" e-mail for a released order, and records
 * what really happened:
 *
 *   SENT     Resend accepted it — notificationSentAt is set only now
 *   SKIPPED  deliberately not sent (test order, staging, Resend not set up);
 *            final, never retried
 *   FAILED   Resend refused or was unreachable; retried after
 *            NOTIFICATION_RETRY_AFTER_MS, at most MAX_NOTIFICATION_ATTEMPTS
 *            times (retryFailedNotifications, driven by the live board)
 *
 * No duplicates: an attempt first takes a lease with a conditional update, so
 * concurrent callers cannot both send; and every attempt for one order carries
 * the same Resend idempotency key, so even a crash between "Resend accepted"
 * and "we recorded SENT" does not deliver a second e-mail.
 *
 * Returns the recorded status, or null when this call did not attempt a send.
 */
export async function notifyRestaurantOnce(
  orderId: string,
  send: NewOrderSender = sendNewOrderNotification
): Promise<"SENT" | "SKIPPED" | "FAILED" | null> {
  const now = new Date();
  const { count } = await db.order.updateMany({
    where: {
      id: orderId,
      releasedToKitchenAt: { not: null },
      notificationSentAt: null,
      notificationAttempts: { lt: MAX_NOTIFICATION_ATTEMPTS },
      AND: [
        {
          OR: [
            { notificationStatus: null },
            { notificationStatus: { in: ["FAILED", "SENDING"] } },
          ],
        },
        {
          OR: [
            { notificationClaimedAt: null },
            { notificationClaimedAt: { lt: new Date(now.getTime() - NOTIFICATION_RETRY_AFTER_MS) } },
          ],
        },
      ],
    },
    data: {
      notificationStatus: "SENDING",
      notificationClaimedAt: now,
      notificationAttempts: { increment: 1 },
    },
  });
  if (count !== 1) return null;

  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;

  // Test orders (simulator / bank sandbox) never reach the real inbox.
  if (order.isTest) {
    await db.order.update({
      where: { id: orderId },
      data: { notificationStatus: "SKIPPED", notificationError: "тестова поръчка" },
    });
    return "SKIPPED";
  }

  const method = isPaymentMethod(order.paymentMethod) ? order.paymentMethod : "CASH_ON_DELIVERY";
  const status = isPaymentStatus(order.paymentStatus) ? order.paymentStatus : "CASH_DUE";
  const totalEur = Number(order.totalEur);

  let outcome: Awaited<ReturnType<NewOrderSender>>;
  try {
    outcome = await send(buildNewOrderEmail(order, method, status, totalEur), {
      idempotencyKey: `pp-new-order-${order.id}`,
    });
  } catch (err) {
    outcome = { status: "failed", error: String((err as Error).message ?? err).slice(0, 300) };
  }

  if (outcome.status === "sent") {
    await db.order.update({
      where: { id: orderId },
      data: { notificationStatus: "SENT", notificationSentAt: new Date(), notificationError: null },
    });
    return "SENT";
  }
  if (outcome.status === "skipped") {
    await db.order.update({
      where: { id: orderId },
      data: { notificationStatus: "SKIPPED", notificationError: outcome.reason },
    });
    return "SKIPPED";
  }
  console.error(
    `[email] restaurant notification for order #${order.orderNumber} failed ` +
      `(attempt ${order.notificationAttempts}/${MAX_NOTIFICATION_ATTEMPTS}): ${outcome.error}`
  );
  // notificationClaimedAt stays as the time of this attempt: the retry clock.
  await db.order.update({
    where: { id: orderId },
    data: { notificationStatus: "FAILED", notificationError: outcome.error },
  });
  return "FAILED";
}

/**
 * Retries restaurant e-mails that failed, once their wait is over. Cheap when
 * there is nothing to do (one indexed query); called from the live board's
 * poll, so a Resend outage heals itself while the shift is running.
 */
export async function retryFailedNotifications(send: NewOrderSender = sendNewOrderNotification): Promise<number> {
  const due = await db.order.findMany({
    where: {
      releasedToKitchenAt: { not: null },
      notificationSentAt: null,
      notificationStatus: { in: ["FAILED", "SENDING"] },
      notificationAttempts: { lt: MAX_NOTIFICATION_ATTEMPTS },
      notificationClaimedAt: { lt: new Date(Date.now() - NOTIFICATION_RETRY_AFTER_MS) },
    },
    select: { id: true },
    take: 5,
  });
  let sent = 0;
  for (const o of due) {
    if ((await notifyRestaurantOnce(o.id, send)) === "SENT") sent++;
  }
  return sent;
}

function buildNewOrderEmail(
  order: Prisma.OrderGetPayload<{ include: { items: true } }>,
  method: "CASH_ON_DELIVERY" | "CARD_ONLINE",
  status: Parameters<typeof collectInstructionBg>[1],
  totalEur: number
): Parameters<NewOrderSender>[0] {
  return {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    deliveryCity: order.deliveryCity,
    deliveryAddress: order.deliveryAddress,
    deliveryNote: order.deliveryNote,
    totalEur,
    paymentLine: collectInstructionBg(method, status, `${totalEur.toFixed(2)} €`),
    isTest: order.isTest,
    items: order.items.map((i) => ({
      nameBg: i.productNameBg,
      variantName: i.variantName,
      quantity: i.quantity,
      totalPriceEur: Number(i.totalPriceEur),
      extras: parseOrderItemExtras(i.extrasJson),
    })),
  };
}

// ── Starting a payment ─────────────────────────────────────────────────────

export type StartPaymentResult =
  | { ok: true; redirectUrl: string; reused: boolean }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "NOT_CARD"
        | "ALREADY_PAID"
        | "ORDER_CANCELLED"
        | "DISABLED"
        | "BUSY"
        | "PROVIDER_ERROR";
    };

async function latestAttempt(orderId: string): Promise<AttemptRow | null> {
  return db.paymentAttempt.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
}

/**
 * Opens (or re-opens) the hosted payment page for an order.
 *
 * At most ONE payable session exists per order: while the latest attempt is
 * still open, every click — the double click, the back button, a second tab —
 * goes back to that same hosted page. A new session is created only after the
 * previous one ended without money (declined, cancelled, expired), so a
 * customer can never be charged twice by us opening two sessions.
 */
export async function startCardPayment(input: {
  accessToken: string;
  locale: "bg" | "en";
}): Promise<StartPaymentResult> {
  const order = await db.order.findUnique({ where: { accessToken: input.accessToken } });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentMethod !== "CARD_ONLINE") return { ok: false, code: "NOT_CARD" };
  if (order.paymentStatus === "PAID") return { ok: false, code: "ALREADY_PAID" };
  if (order.status === "CANCELLED") return { ok: false, code: "ORDER_CANCELLED" };

  const reuse = await reusableSession(order.id);
  if (reuse) return { ok: true, redirectUrl: reuse, reused: true };

  // A demo order (isTest) is paid through the simulator, a real one through
  // the configured provider — see getProviderForNewPayment.
  const setup = await getProviderForNewPayment(order);
  if (!setup) return { ok: false, code: "DISABLED" };
  const { provider, config } = setup;

  // ── Per-order lock: only one request at a time may create a session.
  const now = new Date();
  const { count: locked } = await db.order.updateMany({
    where: {
      id: order.id,
      OR: [{ paymentLockedUntil: null }, { paymentLockedUntil: { lt: now } }],
    },
    data: { paymentLockedUntil: new Date(now.getTime() + PAYMENT_LOCK_MS) },
  });

  if (locked !== 1) {
    // Somebody else (the first click) is creating the session right now.
    // Wait for it and send this click to the same page.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const url = await reusableSession(order.id);
      if (url) return { ok: true, redirectUrl: url, reused: true };
    }
    return { ok: false, code: "BUSY" };
  }

  try {
    // Re-check under the lock: the previous holder may have just finished.
    const again = await reusableSession(order.id);
    if (again) return { ok: true, redirectUrl: again, reused: true };

    const fresh = await db.order.findUnique({ where: { id: order.id } });
    if (!fresh || fresh.paymentStatus === "PAID") return { ok: false, code: "ALREADY_PAID" };

    // The amount is the STORED order total — computed on the server at
    // checkout, never re-read from anything the browser sent.
    const amountMinor = toMinorUnits(fresh.totalEur);
    const attempt = await db.paymentAttempt.create({
      data: {
        orderId: fresh.id,
        reference: newAttemptReference(fresh.orderNumber),
        provider: provider.id,
        environment: provider.environment,
        amountMinor,
        currency: config.currency,
        status: "CREATED",
        locale: input.locale,
      },
    });

    let session;
    try {
      session = await provider.createSession({
        reference: attempt.reference,
        amountMinor,
        currency: config.currency,
        description: `Pizza Pazzo — поръчка №${fresh.orderNumber}`,
        returnUrl: `${config.baseUrl}/api/payments/return?t=${encodeURIComponent(input.accessToken)}`,
        callbackUrl: `${config.baseUrl}/api/payments/callback/${providerSlug(provider.id)}`,
        locale: input.locale,
      });
    } catch (err) {
      console.error(
        `[payments] createSession failed for ${attempt.reference}: ${(err as Error).message}`
      );
      await db.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "ERROR", failureReason: "PROVIDER_UNAVAILABLE", finalizedAt: new Date() },
      });
      return { ok: false, code: "PROVIDER_ERROR" };
    }

    if (!isAcceptableRedirect(session.redirectUrl, config.appEnv)) {
      console.error(`[payments] provider returned an unusable redirect for ${attempt.reference}`);
      await db.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "ERROR", failureReason: "BAD_REDIRECT", finalizedAt: new Date() },
      });
      return { ok: false, code: "PROVIDER_ERROR" };
    }

    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "REDIRECTED",
        providerPaymentId: session.providerPaymentId,
        redirectUrl: session.redirectUrl,
        providerResponse: snapshot(session.safeDetails),
      },
    });
    // A retry after a declined card: the order is waiting for money again.
    await db.order.updateMany({
      where: { id: fresh.id, paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "AWAITING_PAYMENT" },
    });
    console.log(`[payments] ${attempt.reference} → hosted page (${provider.id}/${provider.environment})`);
    return { ok: true, redirectUrl: session.redirectUrl, reused: false };
  } finally {
    await db.order.updateMany({ where: { id: order.id }, data: { paymentLockedUntil: null } });
  }
}

/** The hosted page of the latest attempt if it can still be paid, else null. */
async function reusableSession(orderId: string): Promise<string | null> {
  const latest = await latestAttempt(orderId);
  if (!latest || !isOpenAttempt(latest.status)) return null;
  if (latest.redirectUrl) return latest.redirectUrl;
  // CREATED with no page: either in flight right now, or a creation that
  // crashed. A crashed one is closed so it cannot block the order forever.
  if (Date.now() - latest.createdAt.getTime() > STALE_CREATION_MS) {
    await db.paymentAttempt.updateMany({
      where: { id: latest.id, status: "CREATED", redirectUrl: null },
      data: { status: "ERROR", failureReason: "CREATION_INTERRUPTED", finalizedAt: new Date() },
    });
  }
  return null;
}

function isAcceptableRedirect(url: string, appEnv: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return appEnv === "development" && parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// ── Verifying a payment ────────────────────────────────────────────────────

/**
 * Asks the provider about one attempt and applies the answer. Safe to call
 * from anywhere, any number of times, concurrently.
 *
 * `minIntervalMs` stops a refreshing browser from hammering the provider;
 * callbacks pass 0 because a callback means "something just changed".
 */
export async function syncAttempt(
  attemptId: string,
  options: { minIntervalMs?: number } = {}
): Promise<AttemptRow | null> {
  const attempt = await db.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return null;
  if (attempt.status === "PAID") return attempt; // final, nothing can change it
  if (!attempt.providerPaymentId) return attempt; // the provider never saw it

  const min = options.minIntervalMs ?? 0;
  if (min > 0 && attempt.lastCheckedAt && Date.now() - attempt.lastCheckedAt.getTime() < min) {
    return attempt;
  }

  const provider = await getProviderForAttempt(attempt.provider);
  if (!provider) {
    console.warn(`[payments] no provider available to verify ${attempt.reference} (${attempt.provider})`);
    return attempt;
  }

  await db.paymentAttempt.update({ where: { id: attempt.id }, data: { lastCheckedAt: new Date() } });

  let result: StatusResult;
  try {
    result = await provider.getStatus({
      reference: attempt.reference,
      providerPaymentId: attempt.providerPaymentId,
    });
  } catch (err) {
    // A timeout or an outage says nothing about the money. The attempt keeps
    // its state and the next check (or the provider's callback) decides.
    console.warn(`[payments] status check failed for ${attempt.reference}: ${(err as Error).message}`);
    return db.paymentAttempt.findUnique({ where: { id: attempt.id } });
  }

  await applyProviderStatus(attempt, result);
  return db.paymentAttempt.findUnique({ where: { id: attempt.id } });
}

/**
 * The single place that turns a verified provider answer into our state.
 * Exported for the tests; production code reaches it only through syncAttempt.
 */
export async function applyProviderStatus(attempt: AttemptRow, result: StatusResult): Promise<void> {
  const now = new Date();
  const common = {
    providerStatus: result.rawStatus.slice(0, 100),
    providerResponse: snapshot(result.safeDetails),
  };

  if (result.state === "PAID") {
    const amountOk =
      result.amountMinor === attempt.amountMinor &&
      (result.currency ?? "").toUpperCase() === attempt.currency.toUpperCase();

    if (!amountOk) {
      // The provider says "paid" but not for what we asked. Never release
      // food on that; leave it to a human with the bank portal open.
      console.error(
        `[payments] AMOUNT MISMATCH on ${attempt.reference}: expected ${attempt.amountMinor} ${attempt.currency}, ` +
          `provider reported ${result.amountMinor ?? "?"} ${result.currency ?? "?"}`
      );
      await db.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { not: "PAID" } },
        data: { ...common, status: "PENDING", failureReason: "AMOUNT_MISMATCH" },
      });
      await db.order.update({
        where: { id: attempt.orderId },
        data: { paymentAlert: PAYMENT_ALERTS.AMOUNT_MISMATCH },
      });
      return;
    }

    const won = await db.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { not: "PAID" } },
      data: { ...common, status: "PAID", failureReason: null, finalizedAt: now },
    });
    if (won.count !== 1) return; // a concurrent check already finalised it

    const looked = isRetryableAttempt(attempt.status); // it had looked failed
    const orderWon = await db.order.updateMany({
      where: { id: attempt.orderId, paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "PAID", paidAt: now },
    });

    const order = await db.order.findUnique({ where: { id: attempt.orderId } });
    if (!order) return;

    if (orderWon.count !== 1) {
      // The order was already paid by ANOTHER attempt: real money twice.
      console.error(`[payments] DUPLICATE PAYMENT on order #${order.orderNumber} (${attempt.reference})`);
      await db.order.update({
        where: { id: order.id },
        data: { paymentAlert: PAYMENT_ALERTS.DUPLICATE_PAYMENT },
      });
      return;
    }

    if (order.status === "CANCELLED") {
      console.error(`[payments] payment confirmed for CANCELLED order #${order.orderNumber}`);
      await db.order.update({
        where: { id: order.id },
        data: { paymentAlert: PAYMENT_ALERTS.PAID_AFTER_CANCEL },
      });
      return; // never cook a cancelled order
    }

    if (looked) {
      await db.order.update({
        where: { id: order.id },
        data: { paymentAlert: PAYMENT_ALERTS.LATE_CONFIRMATION },
      });
    }

    console.log(`[payments] ${attempt.reference} PAID → order #${order.orderNumber} released to the kitchen`);
    await releaseToKitchenAndNotify(order.id);
    return;
  }

  // ── Not paid (yet). Only an OPEN attempt moves; a declined/cancelled one
  //    stays as it is until the provider says PAID (handled above).
  const next: AttemptStatus =
    result.state === "PENDING" ? "PENDING" : result.state === "FAILED" ? "FAILED" : result.state;
  const isFinal = next !== "PENDING";
  const moved = await db.paymentAttempt.updateMany({
    where: { id: attempt.id, status: { in: ["CREATED", "REDIRECTED", "PENDING"] } },
    data: {
      ...common,
      status: next,
      failureReason: result.failureReason ?? null,
      ...(isFinal && { finalizedAt: now }),
    },
  });
  if (moved.count !== 1) return;

  // The order mirrors its LATEST attempt, and PAID is never overwritten.
  const latest = await latestAttempt(attempt.orderId);
  if (latest?.id === attempt.id) {
    await db.order.updateMany({
      where: { id: attempt.orderId, paymentMethod: "CARD_ONLINE", paymentStatus: { not: "PAID" } },
      data: { paymentStatus: orderPaymentStatusFor(next) },
    });
  }
}

/**
 * Re-checks what the customer is looking at: every still-open attempt of the
 * order, and the latest one even if it looked final (that is how a late
 * confirmation reaches a customer who is staring at the "failed" page).
 */
export async function refreshOrderPayment(
  orderId: string,
  options: { minIntervalMs?: number } = {}
): Promise<void> {
  const attempts = await db.paymentAttempt.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  const toCheck = attempts.filter((a, i) => isOpenAttempt(a.status) || i === 0);
  for (const a of toCheck) await syncAttempt(a.id, options);
}

// ── Provider callbacks ─────────────────────────────────────────────────────

export interface CallbackOutcome {
  status: 200 | 401 | 404;
  body: string;
}

/**
 * A server-to-server notification from a provider. It is only ever a HINT:
 * it tells us which attempt to re-check, and syncAttempt asks the provider
 * for the truth. Unknown attempts still get 200, so the provider stops
 * retrying something we will never recognise.
 */
export async function handleProviderCallback(
  slug: string,
  request: CallbackRequest
): Promise<CallbackOutcome> {
  const providerId = providerIdFromSlug(slug);
  const provider = providerId ? await getProviderForAttempt(providerId) : null;
  if (!providerId || !provider) return { status: 404, body: "unknown provider" };

  const ident = await provider.identifyCallback(request);
  if (!ident.authentic) {
    console.warn(`[payments] rejected unauthenticated ${slug} callback`);
    return { status: 401, body: "invalid signature" };
  }

  const attempt =
    (ident.reference &&
      (await db.paymentAttempt.findUnique({ where: { reference: ident.reference } }))) ||
    (ident.providerPaymentId &&
      (await db.paymentAttempt.findFirst({
        where: { providerPaymentId: ident.providerPaymentId, provider: providerId },
      }))) ||
    null;

  if (!attempt || attempt.provider !== providerId) {
    console.warn(`[payments] ${slug} callback for an unknown attempt — ignored`);
    return { status: 200, body: "OK" };
  }

  await syncAttempt(attempt.id, { minIntervalMs: 0 });
  return { status: 200, body: "OK" };
}

// ── What the customer's pages show ─────────────────────────────────────────

export type CustomerPaymentState =
  | "PAID"
  | "PENDING"
  | "FAILED"
  | "NOT_STARTED"
  | "ORDER_CANCELLED"
  | "NOT_CARD";

export function customerPaymentState(input: {
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  latestAttemptStatus: string | null;
}): CustomerPaymentState {
  if (input.paymentMethod !== "CARD_ONLINE") return "NOT_CARD";
  if (input.paymentStatus === "PAID") return "PAID";
  if (input.orderStatus === "CANCELLED") return "ORDER_CANCELLED";
  if (!input.latestAttemptStatus) return "NOT_STARTED";
  if (isOpenAttempt(input.latestAttemptStatus)) return "PENDING";
  return "FAILED";
}
