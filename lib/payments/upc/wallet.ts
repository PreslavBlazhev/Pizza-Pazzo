/**
 * UPC "payByWallet" — Google Pay / Apple Pay paid server-to-server.
 * SERVER ONLY, pure (no database, no environment, no network).
 *
 * Sources (read 11.11.2026):
 *   docsecom.atlassian.net/wiki/spaces/DOCEN/pages/49972313 (Google Pay Integration)
 *   docsecom.atlassian.net/wiki/spaces/DOCEN/pages/49972416 (Apple Pay integration)
 *
 * The request ("Final request for purchase"):
 *   { header, payload, signature }   header = {"alg":"RS256"}
 *   payload = { MerchantID, TerminalID, OrderID, TotalAmount, Currency,
 *               PurchaseTime, Wallet: "GOOGLE_PAY" | "APPLE_PAY",
 *               WalletData, PurchaseDesc }
 *   TotalAmount and Currency are JSON numbers in UPC's decoded example
 *   (2000 / 980); WalletData is the wallet's encrypted data as a JSON STRING:
 *     Google Pay  paymentMethodData.tokenizationData.token, verbatim
 *     Apple Pay   the whole ApplePayPayment.token
 *                 ({paymentData, paymentMethod, transactionIdentifier})
 *
 * The signature is the same RS256 envelope this site already uses for the
 * status query on ОББ's gateways (signEnvelope). UPC's pages do not spell out
 * the signed string for payByWallet; the first sandbox run must confirm it —
 * see docs/UBB-UPC-WALLETS.md.
 *
 * The answer is not documented either. What is known: an empty POST to the
 * KBC test endpoint answers HTTP 200 "ERROR=Undefined error" (probe
 * 11.11.2026). So the answer is read defensively, and it NEVER decides that
 * money was taken: only the signed status query does (lib/payments/service).
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

/** The JSON body for UPC_WALLET_URL. Throws on input that cannot be sent. */
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
 *   unreadable anything else (HTML, a 3-D Secure page, garbage)
 * Only identifiers and codes are returned; never card data or the token.
 */
export interface WalletAnswer {
  kind: "signed" | "unsigned" | "error" | "unreadable";
  tranCode?: string;
  /** Short, sanitised text of an ERROR answer (for the log and the admin). */
  error?: string;
}

function codeFrom(o: Record<string, unknown>): string | undefined {
  const results = Array.isArray(o.results) ? (o.results as Array<Record<string, unknown>>) : [];
  const first = results.find((r) => String(r.operType ?? "").toUpperCase() === "PURCHASE") ?? results[0];
  const raw = first?.tranCode ?? first?.actionCode ?? o.TranCode ?? o.tranCode;
  const code = raw === undefined || raw === null ? "" : String(raw).trim();
  return /^\d{3}$/.test(code) ? code : undefined;
}

const clean = (v: string) => v.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export function parseWalletAnswer(
  text: string,
  gatewayKey: KeyObject,
  algorithms: readonly UpcSignatureAlgorithm[]
): WalletAnswer {
  const body = text.trim().slice(0, 20_000);
  const opened = openEnvelope(body, gatewayKey, algorithms);
  if (opened.ok) {
    const p = (opened.payload ?? {}) as Record<string, unknown>;
    return { kind: "signed", tranCode: codeFrom(p) };
  }
  if (opened.reason === "not-envelope" && body.startsWith("{")) {
    try {
      const o = JSON.parse(body) as Record<string, unknown>;
      if (typeof o.ERROR === "string" || typeof o.error === "string") {
        return { kind: "error", error: clean(String(o.ERROR ?? o.error)) };
      }
      return { kind: "unsigned", tranCode: codeFrom(o) };
    } catch {
      return { kind: "unreadable" };
    }
  }
  if (opened.reason !== "not-envelope") return { kind: "unreadable" }; // an envelope that does not verify
  if (/^ERROR=/m.test(body)) {
    return { kind: "error", error: clean(parseKeyValueText(body).ERROR ?? "") };
  }
  const kv = parseKeyValueText(body);
  const code = (kv.TranCode ?? "").trim();
  if (/^\d{3}$/.test(code)) return { kind: "unsigned", tranCode: code };
  return { kind: "unreadable" };
}
