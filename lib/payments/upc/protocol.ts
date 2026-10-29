/**
 * UPC e-Commerce Connect — the wire protocol, as ОББ's terminal speaks it.
 * SERVER ONLY, pure (no database, no environment, no network).
 *
 * Sources (read 29.10.2026; full list in docs/UBB-UPC-INTEGRATION.md §2):
 *   - "Аuthorization" (fields of the hosted-page request),
 *   - "Data Signature" (the exact strings that are signed and verified),
 *   - "NOTIFY_URL – Delivery of the transaction result" (the text answer),
 *   - "Transaction status query" (POST, key=value answer),
 *   - "Transaction status codes", "Endpoints" → BULGARIA (/kbc/…).
 *
 * The signed strings are fixed by UPC, separators and trailing ";" included.
 * Every field keeps its place; a missing optional field leaves its slot
 * empty, and an absent Delay / AltCurrency / AltTotalAmount drops the comma
 * in front of it:
 *
 *   request   MerchantID;TerminalID;PurchaseTime;OrderID[,Delay];Currency[,AltCurrency];TotalAmount[,AltTotalAmount];SD;
 *   gateway   MerchantID;TerminalID;PurchaseTime;OrderID[,Delay];XID;Currency[,AltCurrency];TotalAmount[,AltTotalAmount];SD;TranCode;ApprovalCode;
 *   failure   MerchantID;TerminalID;PurchaseTime;OrderID;Delay;XID;Currency;TotalAmount;TranCode;
 *             (the form documented for the browser's return to FAILURE_URL)
 *
 * Pizza Pazzo sends no Delay (no pre-authorisation), no Alt* amounts, no SD
 * and no Ref3, so its own request string is always
 *   MerchantID;TerminalID;PurchaseTime;OrderID;Currency;TotalAmount;;
 */
import { createPrivateKey, createPublicKey, sign as rsaSign, verify as rsaVerify, type KeyObject } from "node:crypto";

/** Hash algorithms UPC documents for RSA signatures (RSASSA-PKCS1-v1_5). */
export const UPC_SIGNATURE_ALGORITHMS = ["sha512", "sha256", "sha1"] as const;
export type UpcSignatureAlgorithm = (typeof UPC_SIGNATURE_ALGORITHMS)[number];

export function isUpcSignatureAlgorithm(value: string): value is UpcSignatureAlgorithm {
  return (UPC_SIGNATURE_ALGORITHMS as readonly string[]).includes(value);
}

/**
 * ISO 4217 numeric codes. Only what the site can charge is listed — EUR —
 * plus BGN so a terminal still registered in leva is RECOGNISED (and refused)
 * rather than silently mismatched. 980 (UAH) from UPC's examples is not here
 * on purpose.
 */
export const ISO_NUMERIC_CURRENCY: Readonly<Record<string, string>> = { EUR: "978", BGN: "975" };

export function numericCurrency(alpha: string): string | null {
  return ISO_NUMERIC_CURRENCY[alpha.toUpperCase()] ?? null;
}

export function alphaCurrency(numeric: string): string | null {
  for (const [alpha, num] of Object.entries(ISO_NUMERIC_CURRENCY)) if (num === numeric) return alpha;
  return null;
}

// ── PurchaseTime ───────────────────────────────────────────────────────────

/**
 * PurchaseTime in UPC's yyMMddHHmmss, as Sofia wall-clock time. Kyiv (where
 * the gateway runs) has the same offset and the same DST rules, so the
 * gateway's "request is out of date" check (code 411) sees a fresh time.
 * The value is stored with the attempt and sent back verbatim in status
 * queries — it is part of the transaction's identity, never recomputed.
 */
export function formatPurchaseTime(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

// ── Field limits ───────────────────────────────────────────────────────────

/** OrderID is ans..20 and must be unique per payment request. */
export function isValidUpcOrderId(orderId: string): boolean {
  return /^[A-Za-z0-9_-]{1,20}$/.test(orderId);
}

/** TotalAmount is N1..12 in minor units (euro cents). */
export function isValidUpcAmount(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 && String(amountMinor).length <= 12;
}

// ── Signed strings ─────────────────────────────────────────────────────────

export interface UpcRequestSignatureFields {
  MerchantID: string;
  TerminalID: string;
  PurchaseTime: string;
  OrderID: string;
  Currency: string;
  TotalAmount: string;
  SD?: string;
}

/** The string our private key signs for the hosted-page request. */
export function requestSignatureData(f: UpcRequestSignatureFields): string {
  return `${f.MerchantID};${f.TerminalID};${f.PurchaseTime};${f.OrderID};${f.Currency};${f.TotalAmount};${f.SD ?? ""};`;
}

/** A gateway message (NOTIFY, or the browser's return), as posted. */
export type UpcFields = Record<string, string>;

function withComma(value: string, extra: string | undefined): string {
  return extra ? `${value},${extra}` : value;
}

/** The documented gateway string (NOTIFY and the success return). */
export function gatewaySignatureData(f: UpcFields): string {
  return (
    [
      f.MerchantID ?? "",
      f.TerminalID ?? "",
      f.PurchaseTime ?? "",
      withComma(f.OrderID ?? "", f.Delay),
      f.XID ?? "",
      withComma(f.Currency ?? "", f.AltCurrency),
      withComma(f.TotalAmount ?? "", f.AltTotalAmount),
      f.SD ?? "",
      f.TranCode ?? "",
      f.ApprovalCode ?? "",
    ].join(";") + ";"
  );
}

/** The documented FAILURE_URL string (no SD/ApprovalCode, Delay in its own slot). */
export function failureSignatureData(f: UpcFields): string {
  return (
    [
      f.MerchantID ?? "",
      f.TerminalID ?? "",
      f.PurchaseTime ?? "",
      f.OrderID ?? "",
      f.Delay ?? "",
      f.XID ?? "",
      f.Currency ?? "",
      f.TotalAmount ?? "",
      f.TranCode ?? "",
    ].join(";") + ";"
  );
}

// ── Keys ───────────────────────────────────────────────────────────────────

/**
 * Accepts a PEM as is, or the same PEM base64-encoded on one line (how it is
 * pasted into a hosting dashboard's environment variable). Returns "" for
 * anything that is not a PEM.
 */
export function decodePem(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    return decoded.includes("-----BEGIN") ? decoded : "";
  } catch {
    return "";
  }
}

export function loadPrivateKey(pem: string): KeyObject {
  const key = createPrivateKey({ key: pem, format: "pem" });
  if (key.asymmetricKeyType !== "rsa") throw new Error("UPC expects an RSA private key");
  return key;
}

/**
 * The public key from an X.509 certificate (or a bare public key). The key is
 * PINNED: UPC's published gateway certificates are self-signed and long
 * expired (the test one ran out in 2009), so there is no chain or validity
 * date to check — what matters is that the signature was made by exactly the
 * key in the certificate UPC/ОББ handed over.
 */
export function loadPublicKey(pem: string): KeyObject {
  const key = createPublicKey({ key: pem, format: "pem" });
  if (key.asymmetricKeyType !== "rsa") throw new Error("UPC certificates carry RSA keys");
  return key;
}

export function signBase64(data: string, key: KeyObject, algorithm: UpcSignatureAlgorithm): string {
  return rsaSign(algorithm, Buffer.from(data, "utf8"), key).toString("base64");
}

/**
 * Verifies a base64 signature against each allowed hash algorithm and
 * reports which one matched (null = none). Never throws on garbage input.
 */
export function verifyBase64(
  data: string,
  signatureB64: string,
  key: KeyObject,
  algorithms: readonly UpcSignatureAlgorithm[]
): UpcSignatureAlgorithm | null {
  const cleaned = signatureB64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!cleaned || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;
  const signature = Buffer.from(cleaned, "base64");
  if (signature.length === 0) return null;
  for (const algorithm of algorithms) {
    try {
      if (rsaVerify(algorithm, Buffer.from(data, "utf8"), key, signature)) return algorithm;
    } catch {
      /* wrong key size for this signature, etc. — not a match */
    }
  }
  return null;
}

/**
 * Verifies a gateway message (NOTIFY or a browser return). Tries the
 * documented strings in a fixed order — the gateway string, and for a
 * browser return to FAILURE_URL also the failure string — and returns the
 * one that matched. All variants are built from the posted fields only, so
 * whichever matches, the values used afterwards are exactly the signed ones.
 */
export function verifyGatewayMessage(
  fields: UpcFields,
  key: KeyObject,
  algorithms: readonly UpcSignatureAlgorithm[],
  options: { allowFailureForm?: boolean } = {}
): { algorithm: UpcSignatureAlgorithm; form: "gateway" | "failure" } | null {
  const signature = fields.Signature ?? "";
  if (!signature) return null;
  const gateway = verifyBase64(gatewaySignatureData(fields), signature, key, algorithms);
  if (gateway) return { algorithm: gateway, form: "gateway" };
  if (options.allowFailureForm) {
    const failure = verifyBase64(failureSignatureData(fields), signature, key, algorithms);
    if (failure) return { algorithm: failure, form: "failure" };
  }
  return null;
}

// ── Parsing what the gateway sends ─────────────────────────────────────────

/** Field names we read; anything else UPC adds is ignored, as it asks. */
const KNOWN_FIELDS = [
  "MerchantID",
  "TerminalID",
  "PurchaseTime",
  "OrderID",
  "Delay",
  "XID",
  "Currency",
  "AltCurrency",
  "TotalAmount",
  "AltTotalAmount",
  "SD",
  "TranCode",
  "ApprovalCode",
  "Rrn",
  "ProxyPan",
  "WalletType",
  "Signature",
  "Email",
  "CardScheme",
] as const;

const MAX_FIELD = 2048;

/** application/x-www-form-urlencoded body → known fields (case-sensitive names, trimmed values). */
export function parseFormBody(body: string): UpcFields {
  const params = new URLSearchParams(body);
  const out: UpcFields = {};
  for (const name of KNOWN_FIELDS) {
    const v = params.get(name);
    if (v !== null) out[name] = v.trim().slice(0, MAX_FIELD);
  }
  // "Rrn" is spelled "RRN" in some UPC messages.
  if (!out.Rrn) {
    const rrn = params.get("RRN");
    if (rrn !== null) out.Rrn = rrn.trim().slice(0, MAX_FIELD);
  }
  return out;
}

/**
 * The status-query answer. The KBC test gateway answers
 * "TranCode=408\nCurrency=978\n…" (text/html, one Key=Value per line —
 * observed 29.10.2026); UPC documents the refund answer as hidden <input>s.
 * Both are read; values are kept verbatim.
 */
export function parseKeyValueText(text: string): UpcFields {
  const out: UpcFields = {};
  const inputRe = /<input\b[^>]*\bname\s*=\s*["']?([A-Za-z0-9_.]+)["']?[^>]*\bvalue\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(text))) out[m[1]] = m[2].trim();
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq <= 0 || line.includes("<")) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(key)) continue;
    out[key] = line.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

// ── The NOTIFY answer ──────────────────────────────────────────────────────

export type UpcNotifyAction = "approve" | "reverse";

/**
 * The body the gateway expects back from NOTIFY_URL: the transaction's
 * identifying parameters followed by Response.action / .reason /
 * .forwardUrl, one Parameter=Value per line, "\n" separated. "approve"
 * lets the purchase complete; "reverse" makes the gateway cancel it
 * (TranCode 503 "cancelled by the store").
 */
export function buildNotifyResponse(
  fields: UpcFields,
  action: UpcNotifyAction,
  reason: string,
  forwardUrl: string | null
): string {
  const clean = (v: string) => v.replace(/[\r\n]/g, " ").slice(0, 255);
  const lines: string[] = [
    `MerchantID=${clean(fields.MerchantID ?? "")}`,
    `TerminalID=${clean(fields.TerminalID ?? "")}`,
    `OrderID=${clean(fields.OrderID ?? "")}`,
  ];
  if (fields.Delay) lines.push(`Delay=${clean(fields.Delay)}`);
  lines.push(
    `Currency=${clean(fields.Currency ?? "")}`,
    `TotalAmount=${clean(fields.TotalAmount ?? "")}`,
    `XID=${clean(fields.XID ?? "")}`,
    `PurchaseTime=${clean(fields.PurchaseTime ?? "")}`,
    `Response.action=${action}`,
    `Response.reason=${clean(reason)}`,
    `Response.forwardUrl=${forwardUrl ? clean(forwardUrl) : ""}`
  );
  return lines.join("\n") + "\n";
}

// ── TranCode → our state ───────────────────────────────────────────────────

export type UpcOutcome = "PAID" | "PENDING" | "FAILED" | "CANCELLED" | "EXPIRED";

/**
 * How one TranCode is read. Only "000" is money. Anything unknown is PENDING
 * — a human looks at it — never a guess either way.
 *
 *   408  "transaction not found": the gateway has not (yet) registered this
 *        OrderID — the customer has not submitted the page. Not final by
 *        itself; the adapter turns it into EXPIRED only after the session
 *        lifetime has passed.
 *   410  "order paid (possible replay)": a successful transaction with this
 *        OrderID exists — reported as PENDING and investigated, never
 *        assumed paid without a "000".
 */
export function outcomeForTranCode(tranCode: string): UpcOutcome {
  const code = tranCode.trim();
  if (code === "000") return "PAID";
  if (code === "408" || code === "410" || code === "") return "PENDING";
  if (["501", "503", "504", "601"].includes(code)) return "CANCELLED";
  if (code === "502" || code === "411") return "EXPIRED";
  if (/^(1\d\d|2\d\d|40[1-7]|41[2-9]|42\d|43\d|45\d|7\d\d|9\d\d)$/.test(code)) return "FAILED";
  return "PENDING";
}

/** Customer-safe wording keys for a declined/cancelled TranCode (no codes shown). */
export function failureReasonFor(tranCode: string): string {
  const code = tranCode.trim();
  if (code === "116") return "INSUFFICIENT_FUNDS";
  if (code === "404") return "AUTHENTICATION_FAILED";
  if (["101", "111"].includes(code)) return "CARD_DATA";
  if (["105", "108", "130", "131", "701"].includes(code)) return "DECLINED_BY_ISSUER";
  if (["290", "291", "403", "902", "909"].includes(code)) return "TECHNICAL";
  if (["501", "601"].includes(code)) return "CANCELLED_BY_CUSTOMER";
  if (code === "503") return "CANCELLED_BY_MERCHANT";
  if (["401", "402", "405", "407", "411", "412", "430"].includes(code)) return "GATEWAY_REJECTED";
  return `TRANCODE_${code || "NONE"}`;
}
