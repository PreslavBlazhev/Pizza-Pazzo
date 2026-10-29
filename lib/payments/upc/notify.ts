/**
 * NOTIFY_URL — UPC's server-to-server result for one transaction, and our
 * binding answer to it. SERVER ONLY.
 *
 * UPC posts the result (signed with ITS key) before it lets the purchase
 * complete, and reads our text answer: "approve" lets it complete, "reverse"
 * makes the gateway cancel it (TranCode 503). So this is where money is
 * accepted or refused, and the rules are strict:
 *
 *   approve  only when ALL hold: UPC's signature verifies with the pinned
 *            gateway key; MerchantID/TerminalID are ours; the OrderID is one
 *            of our UPC attempts of THIS environment; PurchaseTime, Currency
 *            and TotalAmount are exactly what that attempt signed; it is the
 *            order's latest attempt; the order is not cancelled and not paid
 *            by another attempt.
 *   reverse  anything else — so a duplicate payment, a payment for a
 *            cancelled order or for a superseded attempt is cancelled by the
 *            bank instead of becoming a refund for a person to make.
 *
 * A declined/failed TranCode is recorded and acknowledged ("approve" of a
 * non-payment changes nothing). Repeated or out-of-order NOTIFYs give the
 * same answer and change nothing twice: the state changes are the
 * conditional updates of applyProviderStatus (one kitchen release, one
 * e-mail at most).
 *
 * The browser's arrival on SUCCESS_URL is never used to mark anything paid;
 * it only triggers a status query (lib/payments/upc/browser-return.ts).
 */
import { db } from "@/lib/db";
import { getEffectivePaymentConfig } from "../providers";
import { UPC_PROVIDER_ID, safeUpcDetails, verifyUpcMessage } from "../providers/upc";
import { applyProviderStatus } from "../service";
import { isOpenAttempt, isRetryableAttempt } from "../status";
import type { StatusResult } from "../types";
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

export interface NotifyOutcome {
  /** The exact text/plain body UPC reads. */
  body: string;
  action: UpcNotifyAction;
  /** Short machine reason, for the log and the tests. */
  reason: string;
}

function answer(fields: UpcFields, action: UpcNotifyAction, reason: string, forwardUrl: string | null = null): NotifyOutcome {
  return { body: buildNotifyResponse(fields, action, reason, forwardUrl), action, reason };
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

export async function handleUpcNotify(bodyText: string, env: NodeJS.ProcessEnv = process.env): Promise<NotifyOutcome> {
  const fields = parseFormBody(bodyText);
  const ref = fields.OrderID ?? "?";
  const log = (o: NotifyOutcome, extra = "") => {
    const line = `[payments] UPC notify ${ref} TranCode=${fields.TranCode ?? "?"} → ${o.action} (${o.reason})${extra}`;
    if (o.action === "approve") console.log(line);
    else console.warn(line);
    return o;
  };

  // Settings of the configured environment, even with new card payments
  // switched off: a customer already on UPC's page must still be answered.
  const config = getEffectivePaymentConfig({ ...env, CARD_PAYMENTS_ENABLED: "true" });
  const { settings } = getUpcSettings(config.environment, env);
  if (config.providerId !== "upc" || !settings) {
    return log(answer(fields, "reverse", "not configured"));
  }

  const verified = verifyUpcMessage(settings, fields);
  if (!verified.ok) return log(answer(fields, "reverse", verified.reason));

  const attempt = await db.paymentAttempt.findUnique({ where: { reference: fields.OrderID } });
  if (!attempt || attempt.provider !== UPC_PROVIDER_ID || attempt.environment !== config.environment) {
    return log(answer(fields, "reverse", "unknown order"));
  }
  const order = await db.order.findUnique({
    where: { id: attempt.orderId },
    select: { id: true, accessToken: true, status: true, paymentStatus: true },
  });
  if (!order) return log(answer(fields, "reverse", "unknown order"));
  const forwardUrl = order.accessToken && config.baseUrl
    ? `${config.baseUrl}/api/payments/return?t=${encodeURIComponent(order.accessToken)}`
    : null;

  // Exactly what this attempt signed — nothing re-derived.
  const sent = sentFields(attempt.redirectFormJson);
  if (
    !sent ||
    fields.PurchaseTime !== sent.PurchaseTime ||
    fields.Currency !== sent.Currency ||
    fields.TotalAmount !== sent.TotalAmount ||
    fields.TotalAmount !== String(attempt.amountMinor) ||
    alphaCurrency(fields.Currency ?? "") !== attempt.currency.toUpperCase() ||
    fields.AltCurrency ||
    fields.AltTotalAmount ||
    (fields.Delay && fields.Delay !== "0")
  ) {
    await endAttempt(attempt.id, "NOTIFY_MISMATCH");
    return log(answer(fields, "reverse", "amount/currency/time mismatch", forwardUrl));
  }

  const tranCode = (fields.TranCode ?? "").trim();
  const outcome = outcomeForTranCode(tranCode);
  const details = { ...safeUpcDetails(fields, "notify"), signature: verified.algorithm };

  if (outcome !== "PAID") {
    // A decline / cancellation, recorded as UPC signed it. A "408"/unknown
    // code changes nothing (PENDING keeps the attempt open).
    await applyProviderStatus(attempt, {
      state: outcome,
      rawStatus: tranCode || "NONE",
      failureReason: outcome === "PENDING" ? undefined : failureReasonFor(tranCode),
      safeDetails: details,
    });
    return log(answer(fields, "approve", "recorded", forwardUrl));
  }

  // ── A successful authorisation. Is it a payment we want?
  if (attempt.status === "PAID") {
    return log(answer(fields, "approve", "already recorded", forwardUrl)); // a repeated NOTIFY
  }
  if (order.status === "CANCELLED") {
    await endAttempt(attempt.id, "REVERSED_ORDER_CANCELLED");
    return log(answer(fields, "reverse", "order cancelled", forwardUrl));
  }
  if (order.paymentStatus === "PAID") {
    await endAttempt(attempt.id, "REVERSED_ALREADY_PAID");
    return log(answer(fields, "reverse", "order already paid", forwardUrl));
  }
  const latest = await db.paymentAttempt.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest?.id !== attempt.id) {
    await endAttempt(attempt.id, "REVERSED_SUPERSEDED");
    return log(answer(fields, "reverse", "superseded attempt", forwardUrl));
  }

  // The customer is on UPC's page right now, paying THIS attempt. If our
  // side had already given up on it (e.g. its session timed out while the
  // customer typed), it is the same session — open it again so the payment
  // is handled as an ordinary one, not as a late surprise held for staff.
  if (isRetryableAttempt(attempt.status)) {
    await db.paymentAttempt.updateMany({
      where: { id: attempt.id, status: attempt.status },
      data: { status: "PENDING", finalizedAt: null },
    });
  }
  const current = await db.paymentAttempt.findUnique({ where: { id: attempt.id } });
  if (!current) return log(answer(fields, "reverse", "unknown order"));

  const result: StatusResult = {
    state: "PAID",
    rawStatus: tranCode,
    amountMinor: Number(fields.TotalAmount),
    currency: alphaCurrency(fields.Currency ?? "") ?? undefined,
    safeDetails: details,
  };
  await applyProviderStatus(current, result);

  const after = await db.paymentAttempt.findUnique({ where: { id: attempt.id }, select: { status: true } });
  if (after?.status !== "PAID") {
    // applyProviderStatus refused it (e.g. a concurrent change). No money.
    return log(answer(fields, "reverse", "not accepted", forwardUrl));
  }
  return log(answer(fields, "approve", "ok", forwardUrl), ` sig=${verified.algorithm}`);
}

/**
 * We answered "reverse": the gateway cancels the transaction (TranCode 503).
 * An open attempt ends as CANCELLED through the usual conditional update (so
 * the order mirrors it if it is the latest); a final one keeps its state.
 */
async function endAttempt(attemptId: string, reason: string): Promise<void> {
  const row = await db.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!row || !isOpenAttempt(row.status)) return;
  await applyProviderStatus(row, { state: "CANCELLED", rawStatus: "503", failureReason: reason });
}
