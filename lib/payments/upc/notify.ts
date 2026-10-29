/**
 * NOTIFY_URL — UPC's server-to-server result for one transaction, and our
 * binding answer to it. SERVER ONLY.
 *
 * UPC posts the result (signed with ITS key) and reads our text answer:
 * "approve" lets the purchase complete, "reverse" asks the gateway to cancel
 * it (TranCode 503). An answer is a request, not proof — what the bank
 * finally did is verified later with the status query (./verify.ts).
 *
 * ONE DECISION PER TRANSACTION, WRITTEN BEFORE IT IS SENT.
 * The first valid NOTIFY for an attempt decides; the decision (action,
 * reason, XID, TranCode) is stored with a conditional update — only if no
 * decision exists yet — and only then answered. Every later NOTIFY for the
 * same OrderID + XID (a retry, a duplicate, the retry after we crashed
 * between storing and answering) gets EXACTLY the stored answer, and only
 * re-ensures its idempotent effects. So a repeated callback can never turn an
 * accepted payment into a reversal, and two NOTIFYs racing each other cannot
 * both decide.
 *
 *   approve  first decision, when ALL hold: UPC's signature verifies with the
 *            pinned gateway key; MerchantID/TerminalID are ours; the OrderID
 *            is one of our UPC attempts of THIS environment; PurchaseTime,
 *            Currency and TotalAmount are exactly what that attempt signed;
 *            it is the order's latest attempt; the order is not cancelled
 *            and not paid by another attempt. (Also: a declined TranCode is
 *            acknowledged with "approve" — it changes nothing at the bank.)
 *   reverse  first decision otherwise for a successful authorisation — a
 *            second payment for a paid order, a superseded attempt, a
 *            cancelled order, mismatched data — so the bank is asked to
 *            cancel it instead of a person refunding it later. Forged or
 *            foreign messages are answered "reverse" and change nothing.
 *
 * A second, DIFFERENT transaction (another XID) under an OrderID that
 * already has a decision is answered on its own (a successful one: reverse)
 * and never touches the stored decision or the first transaction.
 *
 * Race with the status query: a "reverse" is only stored while the attempt
 * is not PAID; once stored, a status query can no longer mark it paid
 * (applyProviderStatus). If the status query won first, the payment is ours
 * and the answer is approve.
 *
 * The browser's arrival on SUCCESS_URL is never used to mark anything paid
 * (./browser-return.ts).
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectivePaymentConfig } from "../providers";
import { UPC_PROVIDER_ID, safeUpcDetails, verifyUpcMessage } from "../providers/upc";
import { applyProviderStatus } from "../service";
import { isOpenAttempt, isRetryableAttempt, PAYMENT_ALERTS } from "../status";
import { getUpcSettings } from "./config";
import {
  alphaCurrency,
  buildNotifyResponse,
  failureReasonFor,
  outcomeForTranCode,
  parseFormBody,
  type UpcFields,
  type UpcNotifyAction,
} from "./protocol";

type AttemptRow = Prisma.PaymentAttemptGetPayload<Record<string, never>>;

export interface NotifyOutcome {
  /** The exact text/plain body UPC reads. */
  body: string;
  action: UpcNotifyAction;
  /** Short machine reason, for the log and the tests. */
  reason: string;
  /** True when this answer replays a stored decision. */
  replay: boolean;
}

/** Test seams: what happens between storing a decision and answering. */
export interface NotifyHooks {
  /** Called right after the decision is stored, before any effect or answer. */
  afterDecision?: () => void | Promise<void>;
}

function answer(
  fields: UpcFields,
  action: UpcNotifyAction,
  reason: string,
  forwardUrl: string | null,
  replay = false
): NotifyOutcome {
  return { body: buildNotifyResponse(fields, action, reason, forwardUrl), action, reason, replay };
}

/** Our own copy of what the attempt signed and posted. */
function sentFields(json: string | null): Record<string, string> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

type Effect = "pay" | "record" | "cancel" | "none";
interface Decision {
  action: UpcNotifyAction;
  reason: string;
  effect: Effect;
}

/** The first decision for a valid NOTIFY of this attempt. Pure reads. */
async function decide(attempt: AttemptRow, fields: UpcFields): Promise<Decision> {
  const sent = sentFields(attempt.redirectFormJson);
  const tranCode = (fields.TranCode ?? "").trim();
  const paid = outcomeForTranCode(tranCode) === "PAID";
  const mismatch =
    !sent ||
    fields.PurchaseTime !== sent.PurchaseTime ||
    fields.Currency !== sent.Currency ||
    fields.TotalAmount !== sent.TotalAmount ||
    fields.TotalAmount !== String(attempt.amountMinor) ||
    alphaCurrency(fields.Currency ?? "") !== attempt.currency.toUpperCase() ||
    !!fields.AltCurrency ||
    !!fields.AltTotalAmount ||
    (!!fields.Delay && fields.Delay !== "0");

  if (!paid) {
    // A decline/cancellation: nothing to accept or refuse. Recorded (if the
    // data is ours), acknowledged.
    return { action: "approve", reason: "recorded", effect: mismatch ? "none" : "record" };
  }
  // The status query already recorded this very transaction as paid: never
  // ask the bank to cancel money we have accepted.
  if (attempt.status === "PAID") return { action: "approve", reason: "already recorded", effect: "none" };
  if (mismatch) return { action: "reverse", reason: "amount/currency/time mismatch", effect: "cancel" };

  const order = await db.order.findUnique({
    where: { id: attempt.orderId },
    select: { status: true, paymentStatus: true },
  });
  if (!order) return { action: "reverse", reason: "unknown order", effect: "cancel" };
  if (order.status === "CANCELLED") return { action: "reverse", reason: "order cancelled", effect: "cancel" };
  if (order.paymentStatus === "PAID") return { action: "reverse", reason: "order already paid", effect: "cancel" };
  const latest = await db.paymentAttempt.findFirst({
    where: { orderId: attempt.orderId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest?.id !== attempt.id) return { action: "reverse", reason: "superseded attempt", effect: "cancel" };
  return { action: "approve", reason: "ok", effect: "pay" };
}

/**
 * Applies a decision's effect. Idempotent — run on the first NOTIFY and
 * again on every replay, so a crash between storing and answering heals on
 * the gateway's retry.
 */
async function applyEffect(attemptId: string, effect: Effect, fields: UpcFields, signature: string): Promise<void> {
  const attempt = await db.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return;
  const tranCode = (fields.TranCode ?? "").trim();
  const details = { ...safeUpcDetails(fields, "notify"), signature };

  if (effect === "pay") {
    if (attempt.status === "PAID") return;
    // The customer is on UPC's page right now, paying THIS (latest) attempt.
    // If our side had already given up on it (e.g. its session timed out
    // while the customer typed), it is the same session — opened again so
    // the payment is handled as an ordinary one, not held for staff.
    if (isRetryableAttempt(attempt.status)) {
      await db.paymentAttempt.updateMany({
        where: { id: attempt.id, status: attempt.status },
        data: { status: "PENDING", finalizedAt: null },
      });
    }
    const current = await db.paymentAttempt.findUnique({ where: { id: attempt.id } });
    if (!current) return;
    await applyProviderStatus(current, {
      state: "PAID",
      rawStatus: tranCode,
      amountMinor: Number(fields.TotalAmount),
      currency: alphaCurrency(fields.Currency ?? "") ?? undefined,
      safeDetails: details,
    });
    return;
  }
  if (effect === "record") {
    const outcome = outcomeForTranCode(tranCode);
    if (outcome === "PAID") return;
    await applyProviderStatus(attempt, {
      state: outcome,
      rawStatus: tranCode || "NONE",
      failureReason: outcome === "PENDING" ? undefined : failureReasonFor(tranCode),
      safeDetails: details,
    });
    return;
  }
  if (effect === "cancel" && isOpenAttempt(attempt.status)) {
    // We asked the bank to cancel. The attempt ends; whether the bank really
    // did is verified by ./verify.ts.
    await applyProviderStatus(attempt, {
      state: "CANCELLED",
      rawStatus: "503",
      failureReason: "REVERSED_BY_MERCHANT",
      safeDetails: details,
    });
  }
}

/** The effect a stored decision implies (for replays). */
function storedEffect(attempt: AttemptRow): Effect {
  if (attempt.notifyAction === "reverse") return "cancel";
  if (attempt.notifyReason === "ok") return "pay";
  if (attempt.notifyReason === "recorded") return "record";
  return "none";
}

export async function handleUpcNotify(
  bodyText: string,
  env: NodeJS.ProcessEnv = process.env,
  hooks: NotifyHooks = {}
): Promise<NotifyOutcome> {
  const fields = parseFormBody(bodyText);
  const ref = fields.OrderID ?? "?";
  const log = (o: NotifyOutcome, extra = "") => {
    const line =
      `[payments] UPC notify ${ref.slice(0, 20)} XID=${(fields.XID ?? "?").slice(0, 28)} TranCode=${fields.TranCode ?? "?"}` +
      ` → ${o.action} (${o.reason}${o.replay ? ", replay" : ""})${extra}`;
    if (o.action === "approve") console.log(line);
    else console.warn(line);
    return o;
  };

  // Settings of the configured environment, even with new card payments
  // switched off: a customer already on UPC's page must still be answered.
  const config = getEffectivePaymentConfig({ ...env, CARD_PAYMENTS_ENABLED: "true" });
  const { settings } = getUpcSettings(config.environment, env);
  if (config.providerId !== "upc" || !settings) return log(answer(fields, "reverse", "not configured", null));

  const verified = verifyUpcMessage(settings, fields);
  if (!verified.ok) return log(answer(fields, "reverse", verified.reason, null));

  const found = await db.paymentAttempt.findUnique({ where: { reference: fields.OrderID } });
  if (!found || found.provider !== UPC_PROVIDER_ID || found.environment !== config.environment) {
    return log(answer(fields, "reverse", "unknown order", null));
  }
  let attempt: AttemptRow = found;
  const order = await db.order.findUnique({ where: { id: attempt.orderId }, select: { accessToken: true } });
  const forwardUrl =
    order?.accessToken && config.baseUrl
      ? `${config.baseUrl}/api/payments/return?t=${encodeURIComponent(order.accessToken)}`
      : null;
  const xid = (fields.XID ?? "").trim();
  const tranCode = (fields.TranCode ?? "").trim();

  const incomingPaid = outcomeForTranCode(tranCode) === "PAID";
  for (let round = 0; round < 3; round++) {
    // A stored acknowledgement of a DECLINE moved no money: a later message
    // about a successful authorisation is decided afresh (it replaces the
    // acknowledgement, conditionally). Only a decision about money is final.
    const storedIsPayment = attempt.notifyTranCode === "000";
    const upgradeFromDecline = !!attempt.notifyAction && !storedIsPayment && incomingPaid;

    // ── A decision exists: replay it, or answer a different transaction.
    if (!upgradeFromDecline && (attempt.notifyAction === "approve" || attempt.notifyAction === "reverse")) {
      if (!attempt.notifyXid || !xid || attempt.notifyXid === xid) {
        await applyEffect(attempt.id, storedEffect(attempt), fields, verified.algorithm);
        return log(answer(fields, attempt.notifyAction, attempt.notifyReason ?? "", forwardUrl, true));
      }
      // Another transaction under the same OrderID (the gateway normally
      // refuses that — codes 410/412). The first decision stays untouched.
      if (outcomeForTranCode(tranCode) === "PAID") {
        await db.order.update({
          where: { id: attempt.orderId },
          data: { paymentAlert: PAYMENT_ALERTS.DUPLICATE_PAYMENT, paymentAlertAckAt: null, paymentAlertAckBy: null },
        });
        return log(answer(fields, "reverse", "second transaction for this order", forwardUrl));
      }
      return log(answer(fields, "approve", "recorded", forwardUrl));
    }

    // ── First decision: store it (only if none exists), then act, then answer.
    const decision = await decide(attempt, fields);
    const stored = await db.paymentAttempt.updateMany({
      where: {
        id: attempt.id,
        // Nobody decided yet — or (upgrade) the decline acknowledgement we
        // read is still the stored one.
        ...(upgradeFromDecline
          ? { notifyAction: attempt.notifyAction, notifyTranCode: attempt.notifyTranCode, notifyXid: attempt.notifyXid }
          : { notifyAction: null }),
        // A reverse must not overrule a payment the status query recorded
        // in the meantime.
        ...(decision.action === "reverse" ? { status: { not: "PAID" } } : {}),
      },
      data: {
        notifyAction: decision.action,
        notifyReason: decision.reason,
        notifyXid: xid || null,
        notifyTranCode: tranCode || null,
        notifyDecidedAt: new Date(),
      },
    });
    if (stored.count === 1) {
      await hooks.afterDecision?.();
      await applyEffect(attempt.id, decision.effect, fields, verified.algorithm);
      return log(answer(fields, decision.action, decision.reason, forwardUrl), ` sig=${verified.algorithm}`);
    }
    // Lost a race (a parallel NOTIFY decided, or the status query recorded
    // the payment): re-read and go round — the replay branch answers.
    const again: AttemptRow | null = await db.paymentAttempt.findUnique({ where: { id: attempt.id } });
    if (!again) return log(answer(fields, "reverse", "unknown order", null));
    attempt = again;
  }
  // Unreachable in practice; never answer something we did not store.
  throw new Error("UPC notify: no stable decision");
}
