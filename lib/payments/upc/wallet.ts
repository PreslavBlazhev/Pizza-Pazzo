/**
 * UPC "payByWallet" — Google Pay / Apple Pay paid server-to-server.
 * SERVER ONLY, pure (no database, no environment, no network).
 *
 * Sources (read 14.11.2026, docsecom.atlassian.net/wiki/spaces/DOCEN):
 *   49972313   Google Pay Integration  — envelope, payload fields, WalletData
 *   49972416   Apple Pay intergation   — the same, Wallet "APPLE_PAY"
 *   49973327   Samples (payByToken)    — how UPC's JSON requests are signed
 *                                        and what the signed answer carries
 *   1073086472 Transaction status query — the same signing rule
 *   49973677   Response codes TranCode
 *   ОББ e-mail (November 2026): production only, URL
 *   secure.kbcbank.bg/kbc/payByWallet, gatewayMerchantId = MerchantID, no
 *   Notify — "всички отговори търговецът получава през API".
 *
 * The request ("Final request for purchase"):
 *   { header, payload, signature }   header = {"alg":"RS256"}
 *   payload = { MerchantID, TerminalID, OrderID, TotalAmount, Currency,
 *               PurchaseTime, Wallet: "GOOGLE_PAY" | "APPLE_PAY",
 *               WalletData, PurchaseDesc }
 *   TotalAmount and Currency are JSON numbers in both decoded examples
 *   (2000 / 980, 1000 / 980); PurchaseTime is 12 digits (yyMMddHHmmss).
 *   WalletData is the wallet's encrypted data as a JSON STRING:
 *     Google Pay  paymentMethodData.tokenizationData.token, verbatim
 *     Apple Pay   the whole ApplePayPayment.token
 *                 ({paymentData, paymentMethod, transactionIdentifier}) —
 *                 the page: "encrypted data from Apple, which the merchant
 *                 then transmits in the payment request to WalletData".
 *
 * Signature: UPC's JSON rule (Samples / status query pages) — RS256 over the
 * string "<header>.<payload>" of the two encoded parts, with the merchant
 * key. The wallet pages do not repeat it; ОББ's gateway already accepts
 * exactly this form for the status query (production, 02.11.2026).
 *
 * The answer (Samples): a signed envelope, alg RS512, whose payload carries
 * MerchantID, TerminalID, ApprovalCode, Rrn, HostCode, TranCode, Comment.
 * It is read defensively and NEVER decides that money was taken: only the
 * signed status query does (lib/payments/service). The payByWallet answer
 * itself is NOT documented (only payByToken's is); the wallet pages say just
 * "obtain payment final response from UPC server". The only 3-D Secure remark
 * in UPC's wallet section ("it may be necessary to handle a redirect of the
 * request to the 3D Secure authentication page", page 49972321 "Order") is
 * about another API, with no format — so a redirect-like answer is
 * recognised, never followed, and the payment stays "checking".
 *
 * Open with UPC: the decoded Apple example names the token header
 * "paymentTokenHeader" (with "wrappedKey"), while Apple Pay JS gives
 * "header" — this site sends Apple's token VERBATIM, as the page's own JSON
 * example shows; see docs/UBB-UPC-WALLETS.md.
 */
import type { KeyObject } from "node:crypto";
import { isValidUpcAmount, openEnvelope, parseKeyValueText, signEnvelope, type UpcSignatureAlgorithm } from "./protocol";
import type { WalletType } from "../wallets/config";

/** Wallet tokens are a few KB; anything far bigger is not a wallet token. */
export const MAX_WALLET_DATA = 16_384;

/**
 * Checks the shape of the browser's wallet data WITHOUT reading anything
 * secret from it, and returns it as the exact string UPC receives.
 */
export function normalizeWalletData(wallet: WalletType, raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_WALLET_DATA) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (wallet === "GOOGLE_PAY") {
    // {"signature", "protocolVersion", "signedMessage", ["intermediateSigningKey"]}
    const ok =
      typeof o.signature === "string" &&
      typeof o.protocolVersion === "string" &&
      /^ECv\d$/.test(o.protocolVersion) &&
      typeof o.signedMessage === "string";
    return ok ? raw : null;
  }
  // Apple: {"paymentData": {version, data, signature, header}, "paymentMethod", "transactionIdentifier"}
  const pd = o.paymentData as Record<string, unknown> | undefined;
  const ok =
    !!pd &&
    typeof pd === "object" &&
    typeof pd.version === "string" &&
    typeof pd.data === "string" &&
    typeof pd.signature === "string" &&
    !!pd.header &&
    typeof pd.header === "object" &&
    typeof o.transactionIdentifier === "string";
  return ok ? raw : null;
}

export interface WalletRequestInput {
  merchantId: string;
  terminalId: string;
  /** The attempt's own signed identity — the same fields its hosted page carries. */
  orderId: string;
  purchaseTime: string;
  amountMinor: number;
  currencyNumeric: string;
  wallet: WalletType;
  walletData: string;
  description: string;
}

/** The JSON body for the payByWallet URL. Throws on input that cannot be sent. */
export function buildWalletRequest(input: WalletRequestInput, key: KeyObject): string {
  if (!isValidUpcAmount(input.amountMinor)) throw new Error("amount does not fit UPC");
  if (!/^\d{3}$/.test(input.currencyNumeric)) throw new Error("currency is not ISO 4217 numeric");
  if (!/^\d{12}$/.test(input.purchaseTime)) throw new Error("PurchaseTime is not yyMMddHHmmss");
  const payload = {
    MerchantID: input.merchantId,
    TerminalID: input.terminalId,
    OrderID: input.orderId,
    TotalAmount: input.amountMinor,
    Currency: Number(input.currencyNumeric),
    PurchaseTime: input.purchaseTime,
    Wallet: input.wallet,
    WalletData: input.walletData,
    PurchaseDesc: input.description.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, 125),
  };
  return JSON.stringify(signEnvelope(payload, key));
}

/**
 * What UPC answered, reduced to what may be acted on:
 *   signed     verified with the pinned gateway key — its TranCode is UPC's
 *   unsigned   readable, not signed — a hint only
 *   error      "ERROR=…" text: the request was refused before any payment
 *   action     the answer asks for a customer step (3-D Secure page or a
 *              redirect) — undocumented for payByWallet, never followed
 *   unreadable anything else (garbage, a forged or foreign signed answer)
 * Only identifiers and codes are returned; never card data or the token.
 */
export interface WalletAnswer {
  kind: "signed" | "unsigned" | "error" | "action" | "unreadable";
  tranCode?: string;
  /** Short, sanitised text of an ERROR answer (for the log and the admin). */
  error?: string;
}

/** The identity the answer must belong to (when it names one). */
export interface WalletAnswerIdentity {
  merchantId: string;
  terminalId: string;
  orderId: string;
}

function codeFrom(o: Record<string, unknown>): string | undefined {
  const results = Array.isArray(o.results) ? (o.results as Array<Record<string, unknown>>) : [];
  const first = results.find((r) => String(r.operType ?? "").toUpperCase() === "PURCHASE") ?? results[0];
  const raw = first?.tranCode ?? first?.actionCode ?? o.TranCode ?? o.tranCode;
  const code = raw === undefined || raw === null ? "" : String(raw).trim();
  return /^\d{3}$/.test(code) ? code : undefined;
}

/** Keys that mean "send the customer somewhere" (3-D Secure / redirect). */
const ACTION_KEY = /^(acs|acsurl|url|redirect|redirecturl|location|pareq|creq|termurl|threeds|3ds|threedsurl|md|form|html)$/i;

function asksForAction(o: Record<string, unknown>): boolean {
  return Object.keys(o).some((k) => ACTION_KEY.test(k.replace(/[_-]/g, "")));
}

/** A signed answer that names another merchant, terminal or order is not ours. */
function belongsTo(o: Record<string, unknown>, id: WalletAnswerIdentity | undefined): boolean {
  if (!id) return true;
  const same = (v: unknown, expected: string) => v === undefined || v === null || String(v).trim() === expected;
  return same(o.MerchantID, id.merchantId) && same(o.TerminalID, id.terminalId) && same(o.OrderID, id.orderId);
}

const clean = (v: string) => v.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export function parseWalletAnswer(
  text: string,
  gatewayKey: KeyObject,
  algorithms: readonly UpcSignatureAlgorithm[],
  identity?: WalletAnswerIdentity
): WalletAnswer {
  const body = text.trim().slice(0, 20_000);
  const opened = openEnvelope(body, gatewayKey, algorithms);
  if (opened.ok) {
    const p = opened.payload;
    if (!p || typeof p !== "object" || Array.isArray(p)) return { kind: "unreadable" };
    const o = p as Record<string, unknown>;
    if (!belongsTo(o, identity)) return { kind: "unreadable" };
    const tranCode = codeFrom(o);
    if (!tranCode && asksForAction(o)) return { kind: "action" };
    return { kind: "signed", tranCode };
  }
  if (opened.reason !== "not-envelope") return { kind: "unreadable" }; // an envelope that does not verify
  if (body.startsWith("<")) return { kind: "action" }; // an HTML page (3-D Secure form) instead of an answer
  if (body.startsWith("{")) {
    try {
      const o = JSON.parse(body) as Record<string, unknown>;
      if (typeof o.ERROR === "string" || typeof o.error === "string") {
        return { kind: "error", error: clean(String(o.ERROR ?? o.error)) };
      }
      const tranCode = codeFrom(o);
      if (!tranCode && asksForAction(o)) return { kind: "action" };
      return { kind: "unsigned", tranCode };
    } catch {
      return { kind: "unreadable" };
    }
  }
  if (/^ERROR=/m.test(body)) {
    return { kind: "error", error: clean(parseKeyValueText(body).ERROR ?? "") };
  }
  const kv = parseKeyValueText(body);
  const code = (kv.TranCode ?? "").trim();
  if (/^\d{3}$/.test(code)) return { kind: "unsigned", tranCode: code };
  return { kind: "unreadable" };
}
