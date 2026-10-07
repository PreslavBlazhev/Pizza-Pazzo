/**
 * What staff may do about the money side of an order — SERVER ONLY.
 *
 * None of these moves money. The roles are checked by the server actions in
 * app/actions/admin-payments.ts; these functions take the already-verified
 * actor and do the bookkeeping, each exactly once however often it is called,
 * with an append-only PaymentAuditEvent row.
 *
 *   releaseHeldPaidOrder   a PAID order that was held (late confirmation)
 *                          goes to the kitchen because a person decided so
 *   acknowledgePaymentAlert  "I have seen it" — the alert leaves the live
 *                          board's attention list but stays on the order
 *   recordBankRefund       a refund/reversal that was MADE IN THE BANK'S
 *                          PANEL is written down here with the bank's
 *                          reference. ОББ's terms (т. 14.3) put refunds in the
 *                          bank's admin panel and no refund API was provided,
 *                          so the site never performs one itself.
 */
import { db } from "@/lib/db";
import { notifyRestaurantOnce } from "./service";

export interface StaffActor {
  id: string;
  email: string;
  role: string;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function audit(
  orderId: string,
  action: "RELEASE_HELD_PAID_ORDER" | "ACK_PAYMENT_ALERT" | "REFUND_RECORDED",
  actor: StaffActor,
  details: Record<string, unknown>
): Promise<void> {
  await db.paymentAuditEvent.create({
    data: {
      orderId,
      action,
      actorUserId: actor.id,
      actorEmail: actor.email,
      detailsJson: JSON.stringify(details).slice(0, 2000),
    },
  });
}

/** Sends a held, confirmed-paid card order to the kitchen. Once. */
export async function releaseHeldPaidOrder(orderId: string, actor: StaffActor): Promise<Result> {
  const now = new Date();
  const { count } = await db.order.updateMany({
    where: {
      id: orderId,
      paymentMethod: "CARD_ONLINE",
      paymentStatus: "PAID",
      releasedToKitchenAt: null,
      status: { not: "CANCELLED" },
    },
    data: { releasedToKitchenAt: now, paymentAlertAckAt: now, paymentAlertAckBy: actor.email },
  });
  if (count !== 1) {
    const o = await db.order.findUnique({ where: { id: orderId } });
    if (!o) return { ok: false, error: "Поръчката не е намерена." };
    if (o.releasedToKitchenAt) return { ok: false, error: "Поръчката вече е в кухнята." };
    if (o.status === "CANCELLED") return { ok: false, error: "Поръчката е отказана — не се пуска към кухнята." };
    return { ok: false, error: "Плащането не е потвърдено от банката — поръчката не може да се пусне." };
  }
  await audit(orderId, "RELEASE_HELD_PAID_ORDER", actor, {});
  await notifyRestaurantOnce(orderId);
  return { ok: true };
}

export async function acknowledgePaymentAlert(orderId: string, actor: StaffActor): Promise<Result> {
  const now = new Date();
  const { count } = await db.order.updateMany({
    where: { id: orderId, paymentAlert: { not: null }, paymentAlertAckAt: null },
    data: { paymentAlertAckAt: now, paymentAlertAckBy: actor.email },
  });
  if (count !== 1) return { ok: false, error: "Няма непрегледан сигнал за тази поръчка." };
  const o = await db.order.findUnique({ where: { id: orderId }, select: { paymentAlert: true } });
  await audit(orderId, "ACK_PAYMENT_ALERT", actor, { alert: o?.paymentAlert ?? null });
  return { ok: true };
}

export interface RecordRefundInput {
  orderId: string;
  attemptId: string;
  /** Euro cents, as the bank's panel shows the refunded amount. */
  amountMinor: number;
  kind: "REFUND" | "REVERSAL";
  bankReference: string;
  note?: string;
  /** One per form render: a double submit records one refund. */
  idempotencyKey: string;
}

const BANK_REF = /^[A-Za-z0-9][A-Za-z0-9 ._/\-]{0,63}$/;
const IDEMPOTENCY = /^[A-Za-z0-9-]{16,64}$/;

/** Refunds already recorded against an attempt, in minor units. */
export async function refundedMinor(attemptId: string): Promise<number> {
  const agg = await db.paymentRefundRecord.aggregate({ where: { attemptId }, _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0;
}

export async function recordBankRefund(
  input: RecordRefundInput,
  actor: StaffActor
): Promise<Result<{ duplicate: boolean; remainingMinor: number }>> {
  if (!IDEMPOTENCY.test(input.idempotencyKey)) return { ok: false, error: "Формата е остаряла — презаредете страницата." };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, error: "Сумата трябва да е положителна, в евроцентове." };
  }
  if (input.kind !== "REFUND" && input.kind !== "REVERSAL") return { ok: false, error: "Непознат вид операция." };
  const bankReference = input.bankReference.trim();
  if (!BANK_REF.test(bankReference)) {
    return { ok: false, error: "Въведете референцията на операцията от банковия портал (до 64 знака)." };
  }
  const note = input.note?.trim().slice(0, 500) || null;

  const existing = await db.paymentRefundRecord.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    const remaining = (await db.paymentAttempt.findUnique({ where: { id: existing.attemptId } }))?.amountMinor ?? 0;
    return { ok: true, duplicate: true, remainingMinor: remaining - (await refundedMinor(existing.attemptId)) };
  }

  // SQLite serialises write transactions: the sum check and the insert below
  // cannot interleave with another recording for the same attempt.
  try {
    return await db.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findUnique({ where: { id: input.attemptId } });
      if (!attempt || attempt.orderId !== input.orderId) return { ok: false as const, error: "Плащането не е намерено." };
      if (attempt.status !== "PAID") {
        return { ok: false as const, error: "Възстановяване се отразява само за потвърдено платен опит." };
      }
      const agg = await tx.paymentRefundRecord.aggregate({
        where: { attemptId: attempt.id },
        _sum: { amountMinor: true },
      });
      const already = agg._sum.amountMinor ?? 0;
      const remaining = attempt.amountMinor - already;
      if (input.amountMinor > remaining) {
        return {
          ok: false as const,
          error: `Сумата надвишава оставащата за възстановяване (${(remaining / 100).toFixed(2)} ${attempt.currency}).`,
        };
      }
      if (input.kind === "REVERSAL" && (already > 0 || input.amountMinor !== attempt.amountMinor)) {
        return { ok: false as const, error: "Пълната отмяна (reversal) е само за цялата сума и без предишни възстановявания." };
      }
      await tx.paymentRefundRecord.create({
        data: {
          orderId: input.orderId,
          attemptId: attempt.id,
          amountMinor: input.amountMinor,
          currency: attempt.currency,
          kind: input.kind,
          bankReference,
          note,
          recordedById: actor.id,
          recordedByEmail: actor.email,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.paymentAuditEvent.create({
        data: {
          orderId: input.orderId,
          action: "REFUND_RECORDED",
          actorUserId: actor.id,
          actorEmail: actor.email,
          detailsJson: JSON.stringify({
            attempt: attempt.reference,
            amountMinor: input.amountMinor,
            currency: attempt.currency,
            kind: input.kind,
            bankReference,
          }),
        },
      });
      return { ok: true as const, duplicate: false, remainingMinor: remaining - input.amountMinor };
    });
  } catch (err) {
    // The unique idempotency key lost a race against the same form's twin.
    if ((err as { code?: string }).code === "P2002") {
      return { ok: true, duplicate: true, remainingMinor: -1 };
    }
    throw err;
  }
}
