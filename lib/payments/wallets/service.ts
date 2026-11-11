/**
 * Paying a card order with Google Pay / Apple Pay through UPC. SERVER ONLY.
 *
 *   wallet sheet (browser)  → encrypted payment data, nothing else
 *   POST /api/payments/wallet
 *     payWithWallet         one payable identity per order: the SAME attempt
 *                           (OrderID + PurchaseTime + amount) the card page
 *                           would open — created or re-used by
 *                           startCardPayment, with all its rules (paid →
 *                           stop, in progress → CHECKING, declined → new
 *                           OrderID). UPC refuses a second payment under one
 *                           OrderID, so a wallet and the card page (or two
 *                           wallet taps) can never both take money for it.
 *     → UPC payByWallet     signed with the merchant key; amount = the STORED
 *                           order total, never anything from the browser
 *     → syncAttempt         the signed status query decides PAID / FAILED,
 *                           with the amount check and the kitchen gate of
 *                           every other payment (applyProviderStatus)
 *
 * The wallet token is passed through to UPC and dropped: never stored, never
 * logged, never echoed.
 */
import { db } from "@/lib/db";
import { toMinorUnits } from "../money";
import { getEffectivePaymentConfig } from "../providers";
import { UPC_PROVIDER_ID } from "../providers/upc";
import {
  gatewayHasNoSuchPayment,
  latestAttempt,
  PAYMENT_LOCK_MS,
  startCardPayment,
  syncAttempt,
  type StartPaymentDeps,
  type StartPaymentResult,
} from "../service";
import { isOpenAttempt } from "../status";
import { getUpcSettings, type UpcSettings } from "../upc/config";
import { alphaCurrency, outcomeForTranCode } from "../upc/protocol";
import { buildWalletRequest, normalizeWalletData, parseWalletAnswer, type WalletAnswer } from "../upc/wallet";
import type { PaymentConfig } from "../config";
import { getWalletSettings, walletEnabled, type WalletSettings, type WalletType } from "./config";

/** Apple Pay closes its sheet 30 s after authorisation; the status query follows this call. */
const WALLET_TIMEOUT_MS = 12_000;
/** Wallet submissions on one attempt (declined tokens, retries) before a fresh start is required. */
export const MAX_WALLET_SUBMISSIONS = 5;

export interface WalletOffer {
  config: PaymentConfig;
  wallets: WalletSettings;
  upc: UpcSettings;
}

/**
 * The wallets a REAL UPC order may be paid with right now, or null. A demo or
 * sandbox order is matched to its own environment exactly like the card
 * (getProviderForNewPayment): test tokens never reach the production terminal.
 */
export function resolveWalletOffer(
  order: { isTest: boolean },
  env: NodeJS.ProcessEnv = process.env
): WalletOffer | null {
  const config = getEffectivePaymentConfig(env);
  if (!config.enabled || config.providerId !== "upc" || config.isTest !== order.isTest) return null;
  const wallets = getWalletSettings(config, env);
  if (!wallets.google && !wallets.apple) return null;
  const { settings: upc } = getUpcSettings(config.environment, env);
  if (!upc) return null;
  return { config, wallets, upc };
}

export type WalletSender = (url: string, body: string) => Promise<{ status: number; text: string }>;

const sendToUpc: WalletSender = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(WALLET_TIMEOUT_MS),
    cache: "no-store",
    redirect: "error",
  });
  return { status: res.status, text: (await res.text()).slice(0, 20_000) };
};

export interface WalletDeps extends StartPaymentDeps {
  send?: WalletSender;
  env?: NodeJS.ProcessEnv;
}

type StartFailure = Extract<StartPaymentResult, { ok: false }>["code"];

export type WalletPaymentResult =
  | {
      ok: true;
      /**
       * PAID      confirmed by the bank → success page
       * FAILED    the bank declined / cancelled → failed page (retry = new OrderID)
       * DECLINED  refused before any payment; nothing taken → stay, try again
       * PENDING   no final answer yet → pending page (it keeps checking)
       */
      state: "PAID" | "FAILED" | "DECLINED" | "PENDING";
    }
  | { ok: false; code: StartFailure | "INVALID_WALLET_DATA" | "TOO_MANY_ATTEMPTS" };

const DECLINE_OUTCOMES = new Set(["FAILED", "CANCELLED", "EXPIRED"]);

export async function payWithWallet(
  input: { accessToken: string; locale: "bg" | "en"; wallet: WalletType; walletData: unknown },
  deps: WalletDeps = {}
): Promise<WalletPaymentResult> {
  const env = deps.env ?? process.env;
  const walletData = normalizeWalletData(input.wallet, input.walletData);
  if (!walletData) return { ok: false, code: "INVALID_WALLET_DATA" };

  const order = await db.order.findUnique({ where: { accessToken: input.accessToken } });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentMethod !== "CARD_ONLINE") return { ok: false, code: "NOT_CARD" };
  if (order.paymentStatus === "PAID") return { ok: false, code: "ALREADY_PAID" };
  if (order.status === "CANCELLED") return { ok: false, code: "ORDER_CANCELLED" };
  const offer = resolveWalletOffer(order, env);
  if (!offer || !walletEnabled(offer.wallets, input.wallet)) return { ok: false, code: "DISABLED" };

  // The attempt this payment belongs to — exactly what "Плати с карта" would
  // open. Every "is there already a payment?" rule runs in there.
  const start = await startCardPayment({ accessToken: input.accessToken, locale: input.locale }, deps);
  if (!start.ok) return { ok: false, code: start.code };

  // Per-order lock for the wallet call: two taps (or two tabs) never send twice.
  const now = new Date();
  const { count: locked } = await db.order.updateMany({
    where: { id: order.id, OR: [{ paymentLockedUntil: null }, { paymentLockedUntil: { lt: now } }] },
    data: { paymentLockedUntil: new Date(now.getTime() + PAYMENT_LOCK_MS) },
  });
  if (locked !== 1) return { ok: false, code: "BUSY" };

  let attemptId: string;
  let answer: WalletAnswer = { kind: "unreadable" };
  try {
    const fresh = await db.order.findUnique({ where: { id: order.id } });
    if (!fresh || fresh.paymentStatus === "PAID") return { ok: false, code: "ALREADY_PAID" };
    if (fresh.status === "CANCELLED") return { ok: false, code: "ORDER_CANCELLED" };
    const attempt = await latestAttempt(order.id);
    if (
      !attempt ||
      attempt.provider !== UPC_PROVIDER_ID ||
      attempt.environment !== offer.config.environment ||
      !isOpenAttempt(attempt.status)
    ) {
      return { ok: false, code: "CHECKING" };
    }

    // The amount is the stored order total, and the attempt must carry exactly
    // the identity it was signed with for this terminal.
    let sent: Record<string, string> | null = null;
    try {
      sent = attempt.redirectFormJson ? (JSON.parse(attempt.redirectFormJson) as Record<string, string>) : null;
    } catch {
      sent = null;
    }
    const expectedMinor = toMinorUnits(fresh.totalEur);
    if (
      !sent ||
      attempt.amountMinor !== expectedMinor ||
      sent.TotalAmount !== String(expectedMinor) ||
      sent.OrderID !== attempt.reference ||
      sent.MerchantID !== offer.upc.merchantId ||
      sent.TerminalID !== offer.upc.terminalId ||
      alphaCurrency(sent.Currency ?? "") !== attempt.currency.toUpperCase()
    ) {
      console.error(`[payments] ${attempt.reference}: wallet payment refused — attempt does not match the order/terminal`);
      return { ok: false, code: "PROVIDER_ERROR" };
    }
    if (attempt.walletSubmissions >= MAX_WALLET_SUBMISSIONS) return { ok: false, code: "TOO_MANY_ATTEMPTS" };

    let body: string;
    try {
      body = buildWalletRequest(
        {
          merchantId: offer.upc.merchantId,
          terminalId: offer.upc.terminalId,
          orderId: attempt.reference,
          purchaseTime: sent.PurchaseTime,
          amountMinor: expectedMinor,
          currencyNumeric: sent.Currency,
          wallet: input.wallet,
          walletData,
          description: `Pizza Pazzo order ${fresh.orderNumber}`,
        },
        offer.upc.privateKey
      );
    } catch (err) {
      console.error(`[payments] ${attempt.reference}: wallet request not built: ${(err as Error).message}`);
      return { ok: false, code: "PROVIDER_ERROR" };
    }

    // Counted before sending: a crash or timeout still uses up a submission.
    const claimed = await db.paymentAttempt.updateMany({
      where: { id: attempt.id, walletSubmissions: attempt.walletSubmissions, status: attempt.status },
      data: { walletType: input.wallet, walletSubmittedAt: now, walletSubmissions: { increment: 1 } },
    });
    if (claimed.count !== 1) return { ok: false, code: "BUSY" };
    attemptId = attempt.id;

    let httpStatus = 0;
    try {
      const res = await (deps.send ?? sendToUpc)(offer.wallets.walletUrl, body);
      httpStatus = res.status;
      answer = parseWalletAnswer(res.text, offer.upc.gatewayKey, offer.upc.gatewayAlgorithms);
    } catch (err) {
      // Timeout / dropped connection: UPC may have charged. The status query decides.
      console.warn(`[payments] ${attempt.reference} ${input.wallet} → payByWallet: no answer (${(err as Error).name})`);
    }
    console.log(
      `[payments] ${attempt.reference} ${input.wallet} → payByWallet: HTTP ${httpStatus || "-"} ${answer.kind}` +
        (answer.tranCode ? ` TranCode ${answer.tranCode}` : "") +
        (answer.error ? ` (${answer.error})` : "")
    );
    // What UPC said, for staff — codes only. Written before the status query,
    // so a "not found" read afterwards is from a query made AFTER this call.
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        providerResponse: JSON.stringify({
          source: "wallet",
          wallet: input.wallet,
          http: httpStatus || null,
          answer: answer.kind,
          tranCode: answer.tranCode ?? null,
          error: answer.error ?? null,
        }),
      },
    });
  } finally {
    await db.order.updateMany({ where: { id: order.id }, data: { paymentLockedUntil: null } });
  }

  // The bank's signed status answer is the only thing that says "paid".
  const after = await syncAttempt(attemptId, { minIntervalMs: 0 });
  if (!after) return { ok: true, state: "PENDING" };
  if (after.status === "PAID") return { ok: true, state: "PAID" };
  if (!isOpenAttempt(after.status)) return { ok: true, state: "FAILED" };

  // Still open. UPC refused the request (an ERROR, or a signed decline) AND a
  // fresh status query finds no transaction under this OrderID: nothing was
  // taken, and the same identity may be paid again (wallet or card page).
  const refused =
    answer.kind === "error" ||
    (answer.kind === "signed" && !!answer.tranCode && DECLINE_OUTCOMES.has(outcomeForTranCode(answer.tranCode)));
  if (refused && gatewayHasNoSuchPayment(after)) return { ok: true, state: "DECLINED" };
  return { ok: true, state: "PENDING" };
}

/**
 * May this order's page offer a wallet right now? For Apple's merchant
 * validation, which must not run for an order that cannot be paid.
 */
export async function walletOfferForToken(
  accessToken: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<WalletOffer | null> {
  const order = await db.order.findUnique({ where: { accessToken } });
  if (!order || order.paymentMethod !== "CARD_ONLINE" || order.paymentStatus === "PAID" || order.status === "CANCELLED") {
    return null;
  }
  return resolveWalletOffer(order, env);
}
