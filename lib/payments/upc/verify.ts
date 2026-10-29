/**
 * Verifying our NOTIFY answers against the bank — SERVER ONLY.
 *
 * Our "approve" / "reverse" is a request to UPC, not proof of what the bank
 * did. For every NOTIFY about a SUCCESSFUL authorisation (TranCode 000) the
 * bank's final state is checked with the server-to-server status query,
 * without any customer on the site:
 *
 *   approve + bank 000          → verified
 *   approve + bank final ≠ 000  → APPROVE_NOT_CONFIRMED (e.g. our answer was
 *                                 lost and the gateway cancelled; the order
 *                                 must not be treated as paid unchecked)
 *   reverse + bank 503/504      → verified (the documented cancellation result)
 *   reverse + bank 000          → REVERSE_NOT_CONFIRMED (money is still
 *                                 taken: staff cancel/refund in the portal)
 *   no answer, "not found", a technical or unknown code
 *                               → NOT a confirmation; retried with back-off, at most
 *                                 MAX_BANK_CHECKS times, then
 *                                 BANK_STATUS_UNVERIFIED for a person
 *
 * Alerts are shown on the live board and the order (lib/payments/admin.ts).
 * Nothing here moves money or changes the order's paid flag by itself.
 */
import { db } from "@/lib/db";
import { getProviderForAttempt } from "../providers";
import { UPC_PROVIDER_ID } from "../providers/upc";
import { PAYMENT_ALERTS, type PaymentAlert } from "../status";
import { CONFIRMED_CANCELLATION_CODES, outcomeForTranCode, TECHNICAL_TRAN_CODES } from "./protocol";

/** The bank needs a moment to settle a cancellation; the first look waits. */
export const FIRST_CHECK_AFTER_MS = 2 * 60_000;
/** Bounded retries; the gaps grow (minutes after the decision). */
export const BANK_CHECK_SCHEDULE_MS = [2, 5, 15, 60, 180, 720, 1440, 2880].map((m) => m * 60_000);
export const MAX_BANK_CHECKS = BANK_CHECK_SCHEDULE_MS.length;
/** ОББ's portal reverses within 30 days; older decisions are left to people. */
const MAX_AGE_MS = 35 * 24 * 60 * 60_000;

export interface VerifySummary {
  checked: number;
  verified: number;
  alerted: number;
}

async function alert(orderId: string, kind: PaymentAlert): Promise<void> {
  await db.order.update({
    where: { id: orderId },
    data: { paymentAlert: kind, paymentAlertAckAt: null, paymentAlertAckBy: null },
  });
}

export async function verifyUpcDecisions(
  options: { limit?: number; now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<VerifySummary> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const rows = await db.paymentAttempt.findMany({
    where: {
      provider: UPC_PROVIDER_ID,
      notifyAction: { in: ["approve", "reverse"] },
      notifyTranCode: "000",
      bankVerifiedAt: null,
      bankCheckCount: { lt: MAX_BANK_CHECKS },
      notifyDecidedAt: {
        lt: new Date(now.getTime() - FIRST_CHECK_AFTER_MS),
        gt: new Date(now.getTime() - MAX_AGE_MS),
      },
    },
    orderBy: [{ bankCheckedAt: { sort: "asc", nulls: "first" } }],
    take: limit * 3,
  });

  const summary: VerifySummary = { checked: 0, verified: 0, alerted: 0 };
  for (const a of rows) {
    if (summary.checked >= limit) break;
    const due = a.notifyDecidedAt!.getTime() + BANK_CHECK_SCHEDULE_MS[Math.min(a.bankCheckCount, MAX_BANK_CHECKS - 1)];
    if (now.getTime() < due) continue;
    const provider = await getProviderForAttempt(a.provider, options.env ?? process.env, a.environment);
    if (!provider) continue;

    // Count the check FIRST: a crash or timeout still uses up one retry.
    const claimed = await db.paymentAttempt.updateMany({
      where: { id: a.id, bankCheckCount: a.bankCheckCount, bankVerifiedAt: null },
      data: { bankCheckCount: { increment: 1 }, bankCheckedAt: now },
    });
    if (claimed.count !== 1) continue;
    summary.checked++;
    const lastTry = a.bankCheckCount + 1 >= MAX_BANK_CHECKS;

    let code: string | null = null;
    let notFound = false;
    let failure: string | null = null;
    try {
      const status = await provider.getStatus({
        reference: a.reference,
        providerPaymentId: a.providerPaymentId,
        amountMinor: a.amountMinor,
        currency: a.currency,
        requestFields: a.redirectFormJson ? (JSON.parse(a.redirectFormJson) as Record<string, string>) : null,
        createdAt: a.createdAt,
      });
      code = status.rawStatus;
      notFound = status.notFound === true;
    } catch (err) {
      failure = (err as Error).message.slice(0, 200);
      console.warn(`[payments] UPC verify ${a.reference}: status query failed: ${failure}`);
    }
    // What the bank actually answered, kept for staff (no card data here).
    await db.paymentAttempt.update({
      where: { id: a.id },
      data: {
        bankCheckResult: JSON.stringify({
          source: "verify",
          check: a.bankCheckCount + 1,
          bankCode: code,
          notFound,
          error: failure,
        }).slice(0, 4000),
      },
    });

    const settle = async (kind: PaymentAlert | null) => {
      await db.paymentAttempt.update({ where: { id: a.id }, data: { bankVerifiedAt: now } });
      if (kind) {
        await alert(a.orderId, kind);
        summary.alerted++;
        console.error(`[payments] UPC verify ${a.reference}: ${a.notifyAction} but bank says ${code} → ${kind}`);
      } else {
        summary.verified++;
      }
    };

    // Only a documented FINAL bank result settles anything. A failed query,
    // "not found", a technical code (290/291/403/902/909) or an unknown code
    // is not an answer: retried (bounded), then BANK_STATUS_UNVERIFIED.
    const known = code !== null && /^\d{3}$/.test(code);
    const conclusive = known && !notFound && !TECHNICAL_TRAN_CODES.has(code!);
    if (conclusive && a.notifyAction === "approve") {
      if (code === "000") await settle(null);
      else if (outcomeForTranCode(code!) !== "PENDING") await settle(PAYMENT_ALERTS.APPROVE_NOT_CONFIRMED);
    } else if (conclusive) {
      // A reverse is confirmed only by the bank's own cancellation result.
      if (code === "000") await settle(PAYMENT_ALERTS.REVERSE_NOT_CONFIRMED);
      else if (CONFIRMED_CANCELLATION_CODES.has(code!)) await settle(null);
    }
    const after = await db.paymentAttempt.findUnique({ where: { id: a.id }, select: { bankVerifiedAt: true } });
    if (!after?.bankVerifiedAt && lastTry) {
      await alert(a.orderId, PAYMENT_ALERTS.BANK_STATUS_UNVERIFIED);
      summary.alerted++;
    }
  }
  return summary;
}
