/**
 * ОББ virtual POS on UPC e-Commerce Connect (the "KBC" gateway) — the real
 * bank adapter. SERVER ONLY.
 *
 *   createSession  signs the hosted-page request with OUR private key. Nothing
 *                  is sent server-to-server: the customer's browser posts the
 *                  signed form to the gateway (UPC_GATEWAY_URL) and types the
 *                  card — or picks Google Pay / Apple Pay, where ОББ enabled
 *                  them — on UPC's page only.
 *   getStatus      the server-to-server status query (UPC_STATUS_URL) with the
 *                  exact MerchantID/TerminalID/OrderID/Currency/TotalAmount/
 *                  PurchaseTime of the request. Only TranCode "000" is PAID.
 *   NOTIFY         UPC's signed server-to-server result; verified here
 *                  (verifyUpcMessage) and decided in lib/payments/upc/notify.ts.
 *
 * Card numbers never reach this server; masked PANs, if UPC sends them, are
 * dropped before anything is stored.
 */
import type { PaymentConfig } from "../config";
import {
  PaymentProviderError,
  type CallbackIdentification,
  type CallbackRequest,
  type CreateSessionInput,
  type CreateSessionResult,
  type PaymentProvider,
  type StatusQuery,
  type StatusResult,
} from "../types";
import { getUpcSettings, type UpcSettings } from "../upc/config";
import {
  alphaCurrency,
  failureReasonFor,
  formatPurchaseTime,
  isValidUpcAmount,
  isValidUpcOrderId,
  numericCurrency,
  outcomeForTranCode,
  parseFormBody,
  parseKeyValueText,
  requestSignatureData,
  signBase64,
  verifyGatewayMessage,
  type UpcFields,
  type UpcSignatureAlgorithm,
} from "../upc/protocol";

export const UPC_PROVIDER_ID = "UPC";
const STATUS_TIMEOUT_MS = 15_000;

/** Problems that keep the adapter off (shown to staff in the admin). */
export function upcConfigProblems(config: PaymentConfig, env: NodeJS.ProcessEnv = process.env): string[] {
  const { problems } = getUpcSettings(config.environment, env);
  if (!numericCurrency(config.currency)) problems.push(`Валутата ${config.currency} няма ISO 4217 цифров код за UPC.`);
  return problems;
}

export function createUpcProvider(config: PaymentConfig, env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const { settings, problems } = getUpcSettings(config.environment, env);
  if (!settings) throw new PaymentProviderError(`UPC не е конфигуриран: ${problems.join(" ")}`, "rejected");
  const sandbox = config.environment !== "production";
  return {
    id: UPC_PROVIDER_ID,
    displayName: sandbox
      ? { bg: "UPC eCommerce Connect на ОББ — ТЕСТОВА среда", en: "UBB's UPC eCommerce Connect — TEST environment" }
      : { bg: "UPC eCommerce Connect на ОББ", en: "UBB's UPC eCommerce Connect" },
    environment: config.environment ?? "sandbox",
    sessionReuse: "unregistered-only",
    createSession: async (input) => createSession(settings, input),
    getStatus: async (query) => getStatus(settings, query),
    identifyCallback: async (request) => identifyCallback(settings, request),
  };
}

/** The signed form fields for the hosted page. Pure apart from the clock. */
export function buildUpcPaymentForm(
  settings: Pick<UpcSettings, "merchantId" | "terminalId" | "privateKey" | "requestAlgorithm">,
  input: { reference: string; amountMinor: number; currency: string; locale: "bg" | "en"; description: string },
  now: Date = new Date()
): Record<string, string> {
  const currency = numericCurrency(input.currency);
  if (!currency) throw new PaymentProviderError(`Unsupported currency ${input.currency}`, "rejected");
  if (!isValidUpcOrderId(input.reference)) throw new PaymentProviderError("OrderID does not fit UPC (ans..20)", "rejected");
  if (!isValidUpcAmount(input.amountMinor)) throw new PaymentProviderError("Amount does not fit UPC (N1..12)", "rejected");

  const signed = {
    MerchantID: settings.merchantId,
    TerminalID: settings.terminalId,
    PurchaseTime: formatPurchaseTime(now),
    OrderID: input.reference,
    Currency: currency,
    TotalAmount: String(input.amountMinor),
  };
  return {
    Version: "1",
    ...signed,
    locale: input.locale,
    // ASCII only: the description is shown on UPC's page and in the portal.
    PurchaseDesc: input.description.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, 125),
    Signature: signBase64(requestSignatureData(signed), settings.privateKey, settings.requestAlgorithm),
  };
}

async function createSession(settings: UpcSettings, input: CreateSessionInput): Promise<CreateSessionResult> {
  const fields = buildUpcPaymentForm(settings, input);
  return {
    // UPC has no session id of its own before payment; the OrderID is it.
    providerPaymentId: input.reference,
    redirectUrl: settings.gatewayUrl,
    postFields: fields,
    safeDetails: { purchaseTime: fields.PurchaseTime, currency: fields.Currency, gateway: settings.gatewayUrl },
  };
}

/** Only the fields worth keeping: identifiers and codes, never a PAN or a signature. */
export function safeUpcDetails(fields: UpcFields, source: string): Record<string, unknown> {
  const pick = (k: string) => (fields[k] ? fields[k] : undefined);
  return {
    source,
    tranCode: pick("TranCode"),
    xid: pick("XID"),
    rrn: pick("Rrn"),
    approvalCode: pick("ApprovalCode"),
    walletType: pick("WalletType"),
    currency: pick("Currency"),
    totalAmount: pick("TotalAmount"),
    purchaseTime: pick("PurchaseTime"),
  };
}

async function getStatus(settings: UpcSettings, query: StatusQuery): Promise<StatusResult> {
  const sent = query.requestFields;
  if (!sent?.PurchaseTime || !sent.Currency || !sent.TotalAmount) {
    // Without the original PurchaseTime the gateway cannot find the order.
    throw new PaymentProviderError("UPC status query needs the original request fields");
  }
  const body = new URLSearchParams({
    MerchantID: settings.merchantId,
    TerminalID: settings.terminalId,
    OrderID: query.reference,
    Currency: sent.Currency,
    TotalAmount: sent.TotalAmount,
    PurchaseTime: sent.PurchaseTime,
  });

  let text: string;
  try {
    const res = await fetch(settings.statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = (await res.text()).slice(0, 20_000);
  } catch (err) {
    throw new PaymentProviderError(`UPC status query failed: ${(err as Error).message}`);
  }

  const answer = parseKeyValueText(text);
  const tranCode = (answer.TranCode ?? "").trim();
  if (!/^\d{3}$/.test(tranCode)) throw new PaymentProviderError("UPC status answer without a TranCode");
  for (const [k, expected] of [
    ["MerchantID", settings.merchantId],
    ["TerminalID", settings.terminalId],
    ["OrderID", query.reference],
  ] as const) {
    if (answer[k] && answer[k] !== expected) {
      throw new PaymentProviderError(`UPC status answer is about another ${k}`);
    }
  }

  let state = outcomeForTranCode(tranCode) as StatusResult["state"];
  let failureReason: string | undefined = state === "PAID" || state === "PENDING" ? undefined : failureReasonFor(tranCode);
  if (tranCode === "408" && Date.now() - query.createdAt.getTime() > settings.sessionTtlMs) {
    // Never registered at the gateway and the session lifetime is over. Any
    // late payment of this OrderID would reach NOTIFY and be reversed (it
    // is no longer the order's open attempt), so a new one may be opened.
    state = "EXPIRED";
    failureReason = "SESSION_TIMEOUT";
  }

  const currencyNumeric = answer.Currency || sent.Currency;
  const amount = Number(answer.TotalAmount || sent.TotalAmount);
  return {
    state,
    rawStatus: tranCode,
    // The query is keyed on our amount and currency; when the gateway echoes
    // them, the echo is what we compare.
    amountMinor: Number.isSafeInteger(amount) ? amount : undefined,
    currency: alphaCurrency(currencyNumeric) ?? undefined,
    failureReason,
    safeDetails: safeUpcDetails({ ...answer, TranCode: tranCode }, "status-query"),
  };
}

/**
 * Verifies a message UPC signed (NOTIFY, or the browser's return to
 * SUCCESS_URL / FAILURE_URL) and checks it is for THIS terminal.
 */
export function verifyUpcMessage(
  settings: Pick<UpcSettings, "merchantId" | "terminalId" | "gatewayKey" | "gatewayAlgorithms">,
  fields: UpcFields,
  options: { allowFailureForm?: boolean } = {}
): { ok: true; algorithm: UpcSignatureAlgorithm; form: "gateway" | "failure" } | { ok: false; reason: string } {
  if (!fields.OrderID || !fields.Signature) return { ok: false, reason: "missing fields" };
  const verified = verifyGatewayMessage(fields, settings.gatewayKey, settings.gatewayAlgorithms, options);
  if (!verified) return { ok: false, reason: "bad signature" };
  if (fields.MerchantID !== settings.merchantId || fields.TerminalID !== settings.terminalId) {
    return { ok: false, reason: "other terminal" };
  }
  return { ok: true, ...verified };
}

async function identifyCallback(settings: UpcSettings, request: CallbackRequest): Promise<CallbackIdentification> {
  const fields = parseFormBody(request.bodyText || request.query.toString());
  const v = verifyUpcMessage(settings, fields, { allowFailureForm: true });
  return v.ok ? { authentic: true, reference: fields.OrderID } : { authentic: false };
}
