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
import { sign as rsaSign, verify as rsaVerify } from "node:crypto";
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

async function postStatus(url: string, init: RequestInit): Promise<string> {
  try {
    const res = await fetch(url, {
      ...init,
      method: "POST",
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.text()).slice(0, 20_000);
  } catch (err) {
    throw new PaymentProviderError(`UPC status query failed: ${(err as Error).message}`);
  }
}

/** What either status protocol found, before it is turned into our state. */
interface StatusFinding {
  /** The bank's code, verbatim (JSON "not found" keeps its own, e.g. "291"). */
  tranCode: string;
  /**
   * The gateway has no transaction under this OrderID (text: TranCode 408;
   * JSON: empty results + "…not found"). NOT a final outcome: it never
   * confirms a cancellation and never by itself frees the order for a new
   * payment — see getStatus.
   */
  notFound: boolean;
  amountMinor?: number;
  currencyNumeric?: string;
  details: Record<string, unknown>;
}

/**
 * The SIGNED JSON status query (UPC "Transaction status query", JSON
 * protocol) on the same URL: our request is signed RS256 with our key, the
 * gateway's answer is signed RS512 with UPC's key and VERIFIED here with the
 * pinned gateway certificate before anything is read from it. (Probe
 * 29.10.2026 on ecg.test.upc.ua/kbc/service/01: answer header {"alg":"RS512"},
 * the signature verifies with UPC's published test certificate, SHA-512.)
 * An answer that does not verify is not an answer: it throws.
 */
async function jsonStatus(
  settings: UpcSettings,
  query: StatusQuery,
  sent: Record<string, string>
): Promise<StatusFinding> {
  const b64u = (v: string) => Buffer.from(v).toString("base64url");
  const header = b64u(JSON.stringify({ alg: "RS256" }));
  const payload = b64u(
    JSON.stringify({
      MerchantID: settings.merchantId,
      TerminalID: settings.terminalId,
      OrderID: query.reference,
      TotalAmount: sent.TotalAmount,
      Currency: sent.Currency,
      PurchaseTime: sent.PurchaseTime,
    })
  );
  const signature = rsaSign("sha256", Buffer.from(`${header}.${payload}`), settings.privateKey).toString("base64url");
  const text = await postStatus(settings.statusUrl, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ header, payload, signature }),
  });

  let envelope: { header?: string; payload?: string; signature?: string };
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new PaymentProviderError("UPC status answer is not JSON");
  }
  if (!envelope.header || !envelope.payload || !envelope.signature) {
    throw new PaymentProviderError("UPC status answer is not a signed envelope");
  }
  let alg = "";
  try {
    alg = String(JSON.parse(Buffer.from(envelope.header, "base64url").toString("utf8")).alg ?? "");
  } catch {
    /* falls through to the check below */
  }
  const hash = alg === "RS512" ? "sha512" : alg === "RS256" ? "sha256" : null;
  if (!hash || !settings.gatewayAlgorithms.includes(hash)) {
    throw new PaymentProviderError(`UPC status answer signed with an unaccepted algorithm "${alg}"`);
  }
  const ok = rsaVerify(
    hash,
    Buffer.from(`${envelope.header}.${envelope.payload}`),
    settings.gatewayKey,
    Buffer.from(envelope.signature, "base64url")
  );
  if (!ok) throw new PaymentProviderError("UPC status answer: signature does NOT verify");

  let body: { TranCode?: string; Comment?: string; results?: Array<Record<string, unknown>> };
  try {
    body = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
  } catch {
    throw new PaymentProviderError("UPC status answer: unreadable payload");
  }
  const results = Array.isArray(body.results) ? body.results : [];
  const purchase = results.find((r) => String(r.operType ?? "").toUpperCase() === "PURCHASE") ?? results[0];
  if (!purchase) {
    // e.g. {"results":[],"TranCode":"291","Comment":"Invoice was not found"}
    // (real KBC answer, 29.10.2026). The bank's code and comment are kept as
    // they are; only an explicit "not found" counts as not registered — any
    // other empty answer is an unexplained error and stays unresolved.
    const code = String(body.TranCode ?? "").trim();
    const comment = String(body.Comment ?? "").slice(0, 200);
    if (!code) throw new PaymentProviderError("UPC status answer without results and without a TranCode");
    return {
      tranCode: code,
      notFound: /not\s+found/i.test(comment),
      details: { source: "status-json", tranCode: code, comment, results: 0 },
    };
  }
  const tranCode = String(purchase.tranCode ?? purchase.actionCode ?? "").trim();
  const amount = Number(purchase.amount);
  return {
    tranCode,
    notFound: false,
    amountMinor: Number.isSafeInteger(amount) ? amount : undefined,
    currencyNumeric: purchase.currency ? String(purchase.currency) : undefined,
    details: {
      source: "status-json",
      tranCode,
      rrn: purchase.rrn,
      approvalCode: purchase.approvalCode,
      operType: purchase.operType,
      tranTime: purchase.tranTime,
      // cardNumMasked is deliberately NOT kept.
    },
  };
}

/**
 * The plain status query (form POST → "Key=Value" lines). Not signed by
 * UPC — only TLS protects it — so the answer must echo exactly the
 * MerchantID, TerminalID, OrderID and Currency we asked about.
 */
async function textStatus(
  settings: UpcSettings,
  query: StatusQuery,
  sent: Record<string, string>
): Promise<StatusFinding> {
  const text = await postStatus(settings.statusUrl, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      MerchantID: settings.merchantId,
      TerminalID: settings.terminalId,
      OrderID: query.reference,
      Currency: sent.Currency,
      TotalAmount: sent.TotalAmount,
      PurchaseTime: sent.PurchaseTime,
    }),
  });
  const answer = parseKeyValueText(text);
  const tranCode = (answer.TranCode ?? "").trim();
  for (const [k, expected] of [
    ["MerchantID", settings.merchantId],
    ["TerminalID", settings.terminalId],
    ["OrderID", query.reference],
    ["Currency", sent.Currency],
  ] as const) {
    if (answer[k] !== expected) throw new PaymentProviderError(`UPC status answer does not echo our ${k}`);
  }
  const amount = Number(answer.TotalAmount || sent.TotalAmount);
  return {
    tranCode,
    notFound: tranCode === "408",
    amountMinor: Number.isSafeInteger(amount) ? amount : undefined,
    currencyNumeric: answer.Currency,
    details: safeUpcDetails({ ...answer, TranCode: tranCode }, "status-text"),
  };
}

async function getStatus(settings: UpcSettings, query: StatusQuery): Promise<StatusResult> {
  const sent = query.requestFields;
  if (!sent?.PurchaseTime || !sent.Currency || !sent.TotalAmount) {
    // Without the original PurchaseTime the gateway cannot find the order.
    throw new PaymentProviderError("UPC status query needs the original request fields");
  }
  if (
    (sent.MerchantID && sent.MerchantID !== settings.merchantId) ||
    (sent.TerminalID && sent.TerminalID !== settings.terminalId)
  ) {
    // Started on another terminal (e.g. the test one before the switch to
    // production): this terminal's key and gateway cannot answer for it.
    throw new PaymentProviderError(
      `UPC attempt belongs to terminal ${sent.MerchantID}/${sent.TerminalID}, not the configured one`
    );
  }
  const found =
    settings.statusProtocol === "json"
      ? await jsonStatus(settings, query, sent)
      : await textStatus(settings, query, sent);
  const { tranCode } = found;
  if (!/^\d{3}$/.test(tranCode)) throw new PaymentProviderError("UPC status answer without a TranCode");

  // "Not found" is NOT a result: the attempt stays open (the customer may
  // still be on UPC's page, or a NOTIFY may be late). No timeout turns it
  // into "expired" automatically — a person decides after the UNRESOLVED
  // alert (lib/payments/reconcile.ts). Technical codes stay open the same way
  // (outcomeForTranCode).
  const state = (found.notFound ? "PENDING" : outcomeForTranCode(tranCode)) as StatusResult["state"];
  const failureReason: string | undefined =
    state === "PAID" || state === "PENDING" ? undefined : failureReasonFor(tranCode);

  return {
    state,
    rawStatus: tranCode,
    notFound: found.notFound,
    // What the bank reports; when it does not say, the query itself was
    // keyed on our amount and currency.
    amountMinor: found.amountMinor ?? Number(sent.TotalAmount),
    currency: alphaCurrency(found.currencyNumeric ?? sent.Currency) ?? undefined,
    failureReason,
    // Stored with the attempt: the reuse rule and the admin read it.
    safeDetails: { ...found.details, notFound: found.notFound },
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
