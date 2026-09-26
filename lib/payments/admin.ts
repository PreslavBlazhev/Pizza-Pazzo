/**
 * Payment data for the admin — SERVER ONLY, read-only.
 */
import { db } from "@/lib/db";
import { getEffectivePaymentConfig } from "./providers";

export interface AdminPaymentAttempt {
  id: string;
  reference: string;
  provider: string;
  environment: string;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  providerStatus: string | null;
  failureReason: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  finalizedAt: string | null;
}

/** Every attempt of an order, newest first. No card data exists to leak. */
export async function getPaymentAttemptsForOrder(orderId: string): Promise<AdminPaymentAttempt[]> {
  const rows = await db.paymentAttempt.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    reference: a.reference,
    provider: a.provider,
    environment: a.environment,
    providerPaymentId: a.providerPaymentId,
    amountMinor: a.amountMinor,
    currency: a.currency,
    status: a.status,
    providerStatus: a.providerStatus,
    failureReason: a.failureReason,
    createdAt: a.createdAt.toISOString(),
    lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
    finalizedAt: a.finalizedAt?.toISOString() ?? null,
  }));
}

/** What the admin settings page shows about card payments — no secrets. */
export interface PaymentStatusSummary {
  enabled: boolean;
  problems: string[];
  appEnv: string;
  provider: string | null;
  environment: string | null;
  currency: string;
  baseUrl: string;
  returnUrl: string | null;
  callbackUrl: string | null;
}

export function getPaymentStatusSummary(): PaymentStatusSummary {
  const c = getEffectivePaymentConfig();
  const slug = c.providerId === "simulator" ? "simulator" : c.providerId ? "bank" : null;
  return {
    enabled: c.enabled,
    problems: c.problems,
    appEnv: c.appEnv,
    provider: c.providerId,
    environment: c.environment,
    currency: c.currency,
    baseUrl: c.baseUrl,
    returnUrl: c.baseUrl ? `${c.baseUrl}/api/payments/return` : null,
    callbackUrl: c.baseUrl && slug ? `${c.baseUrl}/api/payments/callback/${slug}` : null,
  };
}
