/**
 * What the customer's payment pages need — SERVER ONLY.
 *
 * Everything is looked up by the order's access token. What comes back is the
 * customer's own order and a coarse state; attempt references, provider ids
 * and raw provider answers stay in the admin.
 */
import { db } from "@/lib/db";
import { getOrderByAccessToken } from "@/lib/orders";
import type { Order } from "@/types/order";
import { getProviderForAttempt, getProviderForNewPayment } from "./providers";
import { customerPaymentState, refreshOrderPayment, type CustomerPaymentState } from "./service";
import { isOpenAttempt } from "./status";

export interface CustomerPaymentView {
  order: Order;
  state: CustomerPaymentState;
  /** Why the latest attempt ended (FAILED/CANCELLED/EXPIRED/ERROR), if it did. */
  latestAttemptStatus: string | null;
  /** An open hosted session exists — "Pay" goes back to the same page. */
  hasOpenSession: boolean;
  /** Name for "you will be sent to the secure page of …". */
  providerName: { bg: string; en: string };
  /** Simulator / sandbox — the page says so in capitals. */
  isTest: boolean;
  /** Which test notice the pages show (payment.testMode…), or null for a real order. */
  testNoticeKey: "testMode" | "testModeSandbox" | null;
}

/**
 * Loads the view, optionally asking the provider first. Pages pass a small
 * `refreshIntervalMs` so a reload re-checks without hammering the provider.
 */
export async function getCustomerPaymentView(
  token: string,
  options: { refresh?: boolean; refreshIntervalMs?: number } = {}
): Promise<CustomerPaymentView | null> {
  let order = await getOrderByAccessToken(token);
  if (!order) return null;

  if (options.refresh && order.paymentMethod === "CARD_ONLINE" && order.paymentStatus !== "PAID") {
    try {
      await refreshOrderPayment(order.id, { minIntervalMs: options.refreshIntervalMs ?? 2000 });
    } catch (err) {
      console.warn("[payments] refresh for customer page failed:", (err as Error).message);
    }
    order = (await getOrderByAccessToken(token)) ?? order;
  }

  const latest = await db.paymentAttempt.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    select: { status: true, provider: true, redirectUrl: true, environment: true },
  });

  // Before the first "Pay" there is no attempt yet: name the provider this
  // order WOULD be paid with, so the page never says "simulator" for a bank.
  const upcoming = latest || order.paymentMethod !== "CARD_ONLINE" ? null : await getProviderForNewPayment(order);
  const provider = latest
    ? await getProviderForAttempt(latest.provider, process.env, latest.environment)
    : (upcoming?.provider ?? null);
  const environment = latest?.environment ?? upcoming?.provider.environment ?? null;

  return {
    order,
    state: customerPaymentState({
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      latestAttemptStatus: latest?.status ?? null,
    }),
    latestAttemptStatus: latest?.status ?? null,
    hasOpenSession: !!latest && isOpenAttempt(latest.status) && !!latest.redirectUrl,
    providerName:
      provider?.displayName ??
      (order.isTest
        ? { bg: "тестов симулатор (без реални пари)", en: "test simulator (no real money)" }
        : { bg: "банката", en: "the bank" }),
    isTest: order.isTest,
    testNoticeKey: !order.isTest ? null : environment === "sandbox" ? "testModeSandbox" : "testMode",
  };
}
