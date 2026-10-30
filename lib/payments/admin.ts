/**
 * Payment data for the admin — SERVER ONLY, read-only.
 */
import { db } from "@/lib/db";
import { getEffectivePaymentConfig } from "./providers";
import { demoSimulatorConfig, getCardDemoMode, type CardDemoMode } from "./demo";
import { OPEN_ATTEMPT_STATUSES } from "./status";
import { UPC_PROVIDER_ID } from "./providers/upc";

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
  /** UPC: our stored NOTIFY answer and whether the bank's status confirmed it. */
  notifyAction: string | null;
  notifyReason: string | null;
  notifyTranCode: string | null;
  bankVerifiedAt: string | null;
  bankCheckCount: number;
  /** The bank's last answer to the verification (code, not found, error). */
  bankCheckResult: string | null;
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
    notifyAction: a.notifyAction,
    notifyReason: a.notifyReason,
    notifyTranCode: a.notifyTranCode,
    bankVerifiedAt: a.bankVerifiedAt?.toISOString() ?? null,
    bankCheckCount: a.bankCheckCount,
    bankCheckResult: a.bankCheckResult,
  }));
}

/**
 * Orders whose money needs a person, for the live board: an alert nobody has
 * acknowledged yet, or a PAID card order that was held back from the kitchen.
 */
export interface PaymentAttentionItem {
  id: string;
  orderNumber: number;
  alert: string | null;
  /** PAID but not released — waiting for a staff decision. */
  heldPaid: boolean;
  isTest: boolean;
}

export async function getPaymentAttention(): Promise<PaymentAttentionItem[]> {
  const rows = await db.order.findMany({
    where: {
      OR: [
        { paymentAlert: { not: null }, paymentAlertAckAt: null },
        {
          paymentMethod: "CARD_ONLINE",
          paymentStatus: "PAID",
          releasedToKitchenAt: null,
          status: { not: "CANCELLED" },
          // A bank-sandbox test order is paid with test cards and is never
          // meant for the kitchen — nothing for the shift to decide.
          paymentAttempts: { none: { environment: "sandbox" } },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true,
      orderNumber: true,
      paymentAlert: true,
      paymentStatus: true,
      releasedToKitchenAt: true,
      status: true,
      isTest: true,
    },
  });
  return rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    alert: o.paymentAlert,
    heldPaid: o.paymentStatus === "PAID" && !o.releasedToKitchenAt && o.status !== "CANCELLED",
    isTest: o.isTest,
  }));
}

/** Refunds recorded from the bank's panel and the money-side audit trail. */
export interface AdminRefundRecord {
  id: string;
  attemptId: string;
  amountMinor: number;
  currency: string;
  kind: string;
  bankReference: string;
  note: string | null;
  recordedByEmail: string | null;
  createdAt: string;
}

export interface AdminPaymentEvent {
  id: string;
  action: string;
  actorEmail: string | null;
  details: string | null;
  createdAt: string;
}

export async function getPaymentRecordsForOrder(
  orderId: string
): Promise<{ refunds: AdminRefundRecord[]; events: AdminPaymentEvent[] }> {
  const [refunds, events] = await Promise.all([
    db.paymentRefundRecord.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } }),
    db.paymentAuditEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    refunds: refunds.map((r) => ({
      id: r.id,
      attemptId: r.attemptId,
      amountMinor: r.amountMinor,
      currency: r.currency,
      kind: r.kind,
      bankReference: r.bankReference,
      note: r.note,
      recordedByEmail: r.recordedByEmail,
      createdAt: r.createdAt.toISOString(),
    })),
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      actorEmail: e.actorEmail,
      details: e.detailsJson,
      createdAt: e.createdAt.toISOString(),
    })),
  };
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
  /**
   * For ОББ's UPC terminal: the three addresses to enter in the bank's
   * portal (Terminals → MerchantID → TerminalID). Null for other providers.
   */
  upcPortalUrls: { success: string; failure: string; notify: string } | null;
  /** The live-site card demo switch (Admin → Settings). */
  demoMode: CardDemoMode;
  /** Why the demo cannot run even when switched on (missing address/secret). */
  demoProblems: string[];
  /**
   * Unfinished ОББ (UPC) attempts per environment ("sandbox" / "production").
   * Read before switching the terminal from test to production: an open
   * attempt of the OTHER environment is never checked against the new
   * terminal, so a person settles it first.
   */
  openUpcAttempts: Record<string, number>;
  /** Who is offered the card option: everyone, or only signed-in staff. */
  audience: "everyone" | "staff";
}

/** SUCCESS_URL / FAILURE_URL / NOTIFY_URL for ОББ's portal, from the public base URL. */
export function upcPortalUrls(baseUrl: string): { success: string; failure: string; notify: string } {
  return {
    success: `${baseUrl}/api/payments/upc/success`,
    failure: `${baseUrl}/api/payments/upc/failure`,
    notify: `${baseUrl}/api/payments/upc/notify`,
  };
}

export async function getPaymentStatusSummary(): Promise<PaymentStatusSummary> {
  const c = getEffectivePaymentConfig();
  const demoMode = await getCardDemoMode();
  const demo = demoSimulatorConfig();
  const slug = c.providerId === "simulator" ? "simulator" : c.providerId ? "upc" : null;
  const open = await db.paymentAttempt.groupBy({
    by: ["environment"],
    where: { provider: UPC_PROVIDER_ID, status: { in: [...OPEN_ATTEMPT_STATUSES] } },
    _count: { _all: true },
  });
  return {
    enabled: c.enabled,
    problems: c.problems,
    appEnv: c.appEnv,
    provider: c.providerId,
    environment: c.environment,
    currency: c.currency,
    baseUrl: c.baseUrl,
    returnUrl: c.baseUrl ? `${c.baseUrl}/api/payments/return` : null,
    callbackUrl: c.baseUrl && slug === "simulator" ? `${c.baseUrl}/api/payments/callback/${slug}` : null,
    upcPortalUrls: c.baseUrl && c.providerId === "upc" ? upcPortalUrls(c.baseUrl) : null,
    demoMode,
    demoProblems: demo.problems,
    openUpcAttempts: Object.fromEntries(open.map((g) => [g.environment, g._count._all])),
    audience: c.audience,
  };
}
