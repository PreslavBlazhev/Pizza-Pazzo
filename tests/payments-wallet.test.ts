/**
 * Google Pay / Apple Pay through UPC payByWallet — settings, protocol, flow.
 *
 * ОББ: wallet payments exist only in PRODUCTION. So this suite runs the UPC
 * adapter with ОББ's production identifiers (MerchantID 7331057, terminal
 * E0901028, secure.kbcbank.bg) but THROWAWAY keys made per run, and plays the
 * bank itself: the status query through a stubbed fetch (signed with the
 * stand-in gateway key), payByWallet through the `send` seam.
 *
 * ⚠️ MOCKS ONLY. No wallet token here is real, no request leaves this process
 * and nothing here is a bank test payment — UPC's answers are modelled on its
 * documentation (Samples / TranCode pages). The real check is a controlled
 * production payment, see docs/UBB-UPC-WALLETS.md.
 *
 * Run: npm run test:upc
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { db } from "@/lib/db";
import { placeOrder } from "@/lib/checkout/place-order";
import { startCardPayment } from "@/lib/payments/service";
import { getEffectivePaymentConfig } from "@/lib/payments/providers";
import { getWalletSettings, UBB_PAY_BY_WALLET_URL, walletClientConfig } from "@/lib/payments/wallets/config";
import { MAX_WALLET_SUBMISSIONS, WALLET_SETTLE_MS, payWithWallet, resolveWalletOffer, type WalletSender } from "@/lib/payments/wallets/service";
import { isAppleValidationUrl, requestAppleMerchantSession } from "@/lib/payments/wallets/apple-session";
import { buildWalletRequest, normalizeWalletData, parseWalletAnswer } from "@/lib/payments/upc/wallet";
import type { PaymentConfig } from "@/lib/payments/config";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, STANDARD_TOTAL_MINOR, deps, key } from "./helpers";

const MID = "7331057";
const TID = "E0901028";
const STATUS_URL = "https://secure.kbcbank.bg/kbc/service/01";

/** A throwaway key + self-signed certificate with CN=<MerchantID> (test only). */
function merchantKeyAndCert(cn: string): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), "upc-wallet-cert-"));
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha512", "-days", "2",
      "-subj", `/C=BG/O=TEST/CN=${cn}`,
      "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.crt"),
    ], { stdio: "ignore" });
    return { key: readFileSync(join(dir, "k.pem"), "utf8"), cert: readFileSync(join(dir, "c.crt"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const MERCHANT = merchantKeyAndCert(MID);
const MERCHANT_KEY = createPrivateKey(MERCHANT.key);
const MERCHANT_PUBLIC = createPublicKey(MERCHANT_KEY);
const GATEWAY_KEY = createPrivateKey(process.env.TEST_UPC_GATEWAY_PRIVATE_KEY!);
const GATEWAY_PUBLIC = createPublicKey(GATEWAY_KEY);

/** Production as prepared for Render (docs/UBB-UPC-PRODUCTION.md), throwaway keys. */
const PRODUCTION_ENV: Record<string, string> = {
  PAYMENT_ENV: "production",
  PAYMENT_SANDBOX_AUDIENCE: "",
  PAYMENT_PRODUCTION_AUDIENCE: "staff",
  UPC_MERCHANT_ID: MID,
  UPC_TERMINAL_ID: TID,
  UPC_PRIVATE_KEY: Buffer.from(MERCHANT.key).toString("base64"),
  UPC_MERCHANT_CERT: MERCHANT.cert,
  UPC_GATEWAY_URL: "https://secure.kbcbank.bg/kbc/pay",
  UPC_STATUS_URL: STATUS_URL,
  UPC_GATEWAY_CERT: process.env.UPC_GATEWAY_CERT!, // the stand-in gateway key
  UPC_GATEWAY_SIGNATURE_ALGS: "sha512",
};
const WALLET_ENV: Record<string, string> = {
  GOOGLE_PAY_ENABLED: "true",
  GOOGLE_PAY_MERCHANT_ID: "BCR2DN4TEST0000",
};
const applyEnv = () => {
  for (const [k, v] of Object.entries({ ...PRODUCTION_ENV, ...WALLET_ENV })) process.env[k] = v;
  for (const k of ["UPC_WALLET_URL", "GOOGLE_PAY_ENVIRONMENT", "GOOGLE_PAY_AUTH_METHODS", "GOOGLE_PAY_GATEWAY_MERCHANT_ID", "APPLE_PAY_ENABLED"]) {
    delete process.env[k];
  }
};
applyEnv();

/** A Google Pay token of the documented shape; MARKER must never show up in a log. */
const MARKER = "SECRET-TOKEN-MARKER-7f3a";
const GOOGLE_TOKEN = JSON.stringify({
  signature: "MEUCIQ" + MARKER,
  intermediateSigningKey: { signedKey: "{}", signatures: ["x"] },
  protocolVersion: "ECv2",
  signedMessage: JSON.stringify({ encryptedMessage: MARKER, ephemeralPublicKey: "BOk", tag: "gMj" }),
});
const APPLE_TOKEN = JSON.stringify({
  paymentData: { version: "EC_v1", data: MARKER, signature: "MIAG", header: { ephemeralPublicKey: "x", publicKeyHash: "y", transactionId: "z" } },
  paymentMethod: { displayName: "Visa 0011", network: "Visa", type: "debit" },
  transactionIdentifier: "6044F628",
});

after(async () => {
  await db.$disconnect();
});

// ── The stand-in gateway: status query (fetch) ────────────────────────────

/** What the status query reports: a TranCode, "408" = not found, or an Error. */
let statusCode: string | Error = "408";
let statusAmount: number | null = null;
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith(STATUS_URL)) return realFetch(input, init);
  if (statusCode instanceof Error) throw statusCode;
  const env = JSON.parse(String(init?.body)) as { header: string; payload: string; signature: string };
  const q = JSON.parse(Buffer.from(env.payload, "base64url").toString("utf8")) as Record<string, string>;
  const results =
    statusCode === "408"
      ? []
      : [{ tranCode: statusCode, amount: statusAmount ?? Number(q.TotalAmount), currency: q.Currency, operType: "PURCHASE", cardNumMasked: "499999******0011" }];
  const b64u = (v: string) => Buffer.from(v).toString("base64url");
  const header = b64u(JSON.stringify({ alg: "RS512" }));
  const payload = b64u(JSON.stringify(results.length ? { results } : { results, TranCode: "291", Comment: "Invoice was not found" }));
  const signature = cryptoSign("sha512", Buffer.from(`${header}.${payload}`), GATEWAY_KEY).toString("base64url");
  return new Response(JSON.stringify({ header, payload, signature }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

// ── The stand-in gateway: payByWallet (send seam) ─────────────────────────

const walletCalls: { url: string; payload: Record<string, unknown>; header: string }[] = [];
/** The text payByWallet answers; a function may also flip the status query. */
let walletAnswer: (() => string) | Error = () => signedAnswer("000");

/** A signed answer shaped like UPC's documented JSON answer (Samples page). */
function signedAnswer(code: string, key = GATEWAY_KEY, extra: Record<string, unknown> = {}): string {
  const b64u = (v: string) => Buffer.from(v).toString("base64url");
  const header = b64u(JSON.stringify({ alg: "RS512" }));
  const payload = b64u(
    JSON.stringify({ MerchantID: MID, TerminalID: TID, ApprovalCode: "", Rrn: "", HostCode: code, TranCode: code, Comment: "", ...extra })
  );
  const signature = cryptoSign("sha512", Buffer.from(`${header}.${payload}`), key).toString("base64url");
  return JSON.stringify({ header, payload, signature });
}

const send: WalletSender = async (url, body) => {
  const env = JSON.parse(body) as { header: string; payload: string; signature: string };
  assert.ok(
    cryptoVerify("sha256", Buffer.from(`${env.header}.${env.payload}`), MERCHANT_PUBLIC, Buffer.from(env.signature, "base64url")),
    "payByWallet is signed RS256 with the merchant key"
  );
  walletCalls.push({
    url,
    header: Buffer.from(env.header, "base64url").toString("utf8"),
    payload: JSON.parse(Buffer.from(env.payload, "base64url").toString("utf8")),
  });
  await new Promise((r) => setTimeout(r, 20));
  if (walletAnswer instanceof Error) throw walletAnswer;
  return { status: 200, text: walletAnswer() };
};

beforeEach(() => {
  statusCode = "408";
  statusAmount = null;
  walletCalls.length = 0;
  walletAnswer = () => {
    statusCode = "000"; // the bank authorised it: the status query now finds it
    return signedAnswer("000");
  };
  applyEnv();
});

async function staffCardOrder() {
  const r = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS, role: "STAFF" },
    deps
  );
  if (!r.ok || !r.accessToken) throw new Error(`placeOrder failed: ${JSON.stringify(r)}`);
  return r as typeof r & { accessToken: string };
}

const pay = (token: string, wallet: "GOOGLE_PAY" | "APPLE_PAY" = "GOOGLE_PAY", walletData: unknown = GOOGLE_TOKEN) =>
  payWithWallet({ accessToken: token, locale: "bg", wallet, walletData }, { send });

const attempts = (orderNumber: number) =>
  db.paymentAttempt.findMany({ where: { order: { orderNumber } }, orderBy: { createdAt: "asc" } });

/** Runs fn and returns everything written to the console meanwhile. */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const lines: string[] = [];
  const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const grab = (...a: unknown[]) => lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  console.log = console.warn = console.error = console.info = grab;
  try {
    return { result: await fn(), logs: lines.join("\n") };
  } finally {
    Object.assign(console, saved);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

const fakeConfig = (environment: "sandbox" | "production"): PaymentConfig => ({
  enabled: true,
  problems: [],
  appEnv: "production",
  providerId: "upc",
  environment,
  currency: "EUR",
  baseUrl: "https://pizzapazzo.bg",
  isTest: environment === "sandbox",
  audience: "staff",
  audienceSource: "env",
  simulatorSecret: "",
});
const env = (extra: Record<string, string> = {}) => ({ ...process.env, ...PRODUCTION_ENV, ...WALLET_ENV, ...extra });

test("settings: the production config is complete; ОББ's payByWallet URL by default; gatewayMerchantId = MerchantID", () => {
  const config = getEffectivePaymentConfig(env());
  assert.deepEqual(config.problems, []);
  assert.equal(config.environment, "production");
  const s = getWalletSettings(config, env());
  assert.deepEqual(s.problems, []);
  assert.equal(s.walletUrl, "https://secure.kbcbank.bg/kbc/payByWallet");
  assert.equal(UBB_PAY_BY_WALLET_URL, "https://secure.kbcbank.bg/kbc/payByWallet");
  assert.equal(s.google?.gatewayMerchantId, MID, "ОББ: gatewayMerchantId = merchant id");
  assert.equal(s.google?.merchantId, "BCR2DN4TEST0000", "Google's own id stays separate");
  assert.equal(s.google?.environment, "PRODUCTION");
  assert.deepEqual(s.google?.authMethods, ["CRYPTOGRAM_3DS"]);
});

test("settings: no wallet in sandbox (ОББ: production only), none through the simulator, off unless switched on", () => {
  const sandbox = getWalletSettings(fakeConfig("sandbox"), env());
  assert.equal(sandbox.google, null);
  assert.match(sandbox.problems.join(" "), /само в продукционна среда/);
  const config = getEffectivePaymentConfig(env());
  assert.equal(getWalletSettings({ ...config, providerId: "simulator" }, env()).google, null);
  assert.equal(getWalletSettings({ ...config, enabled: false }, env()).google, null);
  assert.equal(getWalletSettings(config, env({ GOOGLE_PAY_ENABLED: "" })).google, null);
  assert.equal(getWalletSettings(config, env({ GOOGLE_PAY_ENABLED: "false" })).google, null);
});

test("settings: the wallet URL must be HTTPS on the gateway's own host, never UPC's test host", () => {
  const config = getEffectivePaymentConfig(env());
  for (const url of [
    "https://ecg.test.upc.ua/kbc/payByWallet",
    "https://secure.upc.ua/go/payByWallet",
    "http://secure.kbcbank.bg/kbc/payByWallet",
    "https://secure.kbcbank.bg.evil.example/kbc/payByWallet",
    "https://user@secure.kbcbank.bg/kbc/payByWallet",
  ]) {
    assert.equal(getWalletSettings(config, env({ UPC_WALLET_URL: url })).google, null, url);
  }
  assert.ok(getWalletSettings(config, env({ UPC_WALLET_URL: "https://secure.kbcbank.bg/kbc/payByWallet" })).google);
});

test("settings: Google Pay — Google merchantId required for PRODUCTION; PAN_ONLY refused (3-D Secure redirect undocumented); stale pos_id refused", () => {
  const config = getEffectivePaymentConfig(env());
  const noId = getWalletSettings(config, env({ GOOGLE_PAY_MERCHANT_ID: "" }));
  assert.equal(noId.google, null);
  assert.match(noId.problems.join(" "), /GOOGLE_PAY_MERCHANT_ID.*PRODUCTION/);
  const pan = getWalletSettings(config, env({ GOOGLE_PAY_AUTH_METHODS: "PAN_ONLY,CRYPTOGRAM_3DS" }));
  assert.equal(pan.google, null);
  assert.match(pan.problems.join(" "), /PAN_ONLY/);
  assert.equal(getWalletSettings(config, env({ GOOGLE_PAY_AUTH_METHODS: "FOO" })).google, null);
  const stale = getWalletSettings(config, env({ GOOGLE_PAY_GATEWAY_MERCHANT_ID: "POS-1" }));
  assert.equal(stale.google, null);
  assert.ok(getWalletSettings(config, env({ GOOGLE_PAY_GATEWAY_MERCHANT_ID: MID })).google, "the same id is harmless");
  assert.equal(getWalletSettings(config, env({ GOOGLE_PAY_ENVIRONMENT: "SANDBOX" })).google, null);
  const preview = getWalletSettings(config, env({ GOOGLE_PAY_ENVIRONMENT: "TEST", GOOGLE_PAY_MERCHANT_ID: "" }));
  assert.equal(preview.google?.environment, "TEST", "TEST needs no Google merchant id");
});

test("settings: Apple Pay needs its merchant id, Merchant Identity cert + key; otherwise it is hidden", () => {
  const config = getEffectivePaymentConfig(env());
  const s = getWalletSettings(config, env({ APPLE_PAY_ENABLED: "true" }));
  assert.equal(s.apple, null);
  assert.ok(s.google, "Google Pay is not affected by a half-configured Apple Pay");
  const text = s.problems.join(" ");
  for (const v of ["APPLE_PAY_MERCHANT_ID", "APPLE_PAY_MERCHANT_IDENTITY_CERT", "APPLE_PAY_MERCHANT_IDENTITY_KEY"]) assert.match(text, new RegExp(v));
  const junk = getWalletSettings(config, env({
    APPLE_PAY_ENABLED: "true",
    APPLE_PAY_MERCHANT_ID: "merchant.bg.pizzapazzo",
    APPLE_PAY_MERCHANT_IDENTITY_CERT: "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----",
    APPLE_PAY_MERCHANT_IDENTITY_KEY: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----",
  }));
  assert.equal(junk.apple, null);
  assert.match(junk.problems.join(" "), /не е валиден/);
  // A matching (throwaway) identity certificate + key: Apple Pay is configured.
  const identity = merchantKeyAndCert("merchant.bg.pizzapazzo");
  const ok = getWalletSettings(config, env({
    APPLE_PAY_ENABLED: "true",
    APPLE_PAY_MERCHANT_ID: "merchant.bg.pizzapazzo",
    APPLE_PAY_MERCHANT_IDENTITY_CERT: identity.cert,
    APPLE_PAY_MERCHANT_IDENTITY_KEY: Buffer.from(identity.key).toString("base64"),
  }));
  assert.equal(ok.apple?.domain, "pizzapazzo.bg");
  assert.equal(ok.apple?.countryCode, "BG");
});

test("client config: gateway 'upcua', gatewayMerchantId = MerchantID, VISA/MASTERCARD, CRYPTOGRAM_3DS, the SERVER amount — no secrets", () => {
  const s = getWalletSettings(getEffectivePaymentConfig(env()), env());
  const c = walletClientConfig(s, { amountMinor: 2090, currency: "EUR" })!;
  assert.equal(c.amount, "20.90");
  assert.equal(c.countryCode, "BG");
  assert.equal(c.google?.environment, "PRODUCTION");
  assert.equal(c.google?.gateway, "upcua");
  assert.equal(c.google?.gatewayMerchantId, MID);
  assert.equal(c.google?.merchantId, "BCR2DN4TEST0000");
  assert.deepEqual(c.google?.networks, ["MASTERCARD", "VISA"]);
  assert.deepEqual(c.google?.authMethods, ["CRYPTOGRAM_3DS"]);
  assert.equal(c.apple, null);
  assert.doesNotMatch(JSON.stringify(c), /PRIVATE KEY|BEGIN/);

  // The Google TEST preview is drawn for staff only.
  const preview = getWalletSettings(getEffectivePaymentConfig(env()), env({ GOOGLE_PAY_ENVIRONMENT: "TEST" }));
  assert.equal(walletClientConfig(preview, { amountMinor: 2090, currency: "EUR" }), null);
  assert.equal(walletClientConfig(preview, { amountMinor: 2090, currency: "EUR", viewerIsStaff: true })?.google?.environment, "TEST");
});

// ── Protocol ─────────────────────────────────────────────────────────────

test("payByWallet request: RS256 envelope, UPC's payload fields, numbers as in UPC's example, WalletData verbatim", () => {
  const body = buildWalletRequest(
    {
      merchantId: MID,
      terminalId: TID,
      orderId: "PP1001-0A1B2C3D",
      purchaseTime: "261111120000",
      amountMinor: 2090,
      currencyNumeric: "978",
      wallet: "GOOGLE_PAY",
      walletData: GOOGLE_TOKEN,
      description: "Pizza Pazzo — поръчка 1001",
    },
    MERCHANT_KEY
  );
  const env = JSON.parse(body);
  assert.deepEqual(Object.keys(env), ["header", "payload", "signature"]);
  assert.deepEqual(JSON.parse(Buffer.from(env.header, "base64url").toString()), { alg: "RS256" });
  assert.ok(cryptoVerify("sha256", Buffer.from(`${env.header}.${env.payload}`), MERCHANT_PUBLIC, Buffer.from(env.signature, "base64url")));
  assert.deepEqual(JSON.parse(Buffer.from(env.payload, "base64url").toString()), {
    MerchantID: MID,
    TerminalID: TID,
    OrderID: "PP1001-0A1B2C3D",
    TotalAmount: 2090,
    Currency: 978,
    PurchaseTime: "261111120000",
    Wallet: "GOOGLE_PAY",
    WalletData: GOOGLE_TOKEN,
    PurchaseDesc: "Pizza Pazzo поръчка 1001".replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim(),
  });
});

test("wallet data: only the documented token shapes are accepted", () => {
  assert.equal(normalizeWalletData("GOOGLE_PAY", GOOGLE_TOKEN), GOOGLE_TOKEN);
  assert.equal(normalizeWalletData("APPLE_PAY", APPLE_TOKEN), APPLE_TOKEN);
  assert.equal(normalizeWalletData("GOOGLE_PAY", APPLE_TOKEN), null);
  assert.equal(normalizeWalletData("APPLE_PAY", GOOGLE_TOKEN), null);
  for (const junk of [undefined, "", "{}", "[]", "not json", 42, "x".repeat(20_000)]) {
    assert.equal(normalizeWalletData("GOOGLE_PAY", junk), null, String(junk).slice(0, 20));
  }
});

test("wallet answer: signed = UPC's; forged/foreign/unsigned never trusted; ERROR text; 3-D Secure recognised, never followed", () => {
  const algs = ["sha512"] as const;
  const id = { merchantId: MID, terminalId: TID, orderId: "PP1001-0A1B2C3D" };
  assert.deepEqual(parseWalletAnswer(signedAnswer("000"), GATEWAY_PUBLIC, algs, id), { kind: "signed", tranCode: "000" });
  assert.deepEqual(parseWalletAnswer(signedAnswer("116"), GATEWAY_PUBLIC, algs, id), { kind: "signed", tranCode: "116" });
  assert.deepEqual(parseWalletAnswer(signedAnswer("999"), GATEWAY_PUBLIC, algs, id), { kind: "signed", tranCode: "999" });
  assert.deepEqual(parseWalletAnswer(signedAnswer("000", MERCHANT_KEY), GATEWAY_PUBLIC, algs, id), { kind: "unreadable" }, "forged");
  assert.deepEqual(
    parseWalletAnswer(signedAnswer("000", GATEWAY_KEY, { OrderID: "PP9999-FFFFFFFF" }), GATEWAY_PUBLIC, algs, id),
    { kind: "unreadable" },
    "a signed answer for another order is not ours"
  );
  assert.deepEqual(
    parseWalletAnswer(signedAnswer("000", GATEWAY_KEY, { TerminalID: "E7059096" }), GATEWAY_PUBLIC, algs, id),
    { kind: "unreadable" },
    "nor one from the test terminal"
  );
  // An empty POST to ecg.test.upc.ua/kbc/payByWallet answered exactly this (probe 11.11.2026).
  assert.deepEqual(parseWalletAnswer("ERROR=Undefined error", GATEWAY_PUBLIC, algs), { kind: "error", error: "Undefined error" });
  assert.deepEqual(parseWalletAnswer("TranCode=105\n", GATEWAY_PUBLIC, algs), { kind: "unsigned", tranCode: "105" });
  assert.deepEqual(parseWalletAnswer("<html><form action='https://acs.example'>3-D Secure</form></html>", GATEWAY_PUBLIC, algs), { kind: "action" });
  assert.deepEqual(parseWalletAnswer(JSON.stringify({ acsUrl: "https://acs.example", PaReq: "x" }), GATEWAY_PUBLIC, algs), { kind: "action" });
  assert.deepEqual(parseWalletAnswer("garbage", GATEWAY_PUBLIC, algs), { kind: "unreadable" });
});

test("Apple merchant validation: only Apple's gateway hosts; the documented body; the session passed through", async () => {
  for (const ok of [
    "https://apple-pay-gateway.apple.com/paymentservices/startSession",
    "https://apple-pay-gateway-nc-pod3.apple.com/paymentservices/paymentSession",
    "https://apple-pay-gateway-cert.apple.com/paymentservices/startSession",
    "https://cn-apple-pay-gateway-sh-pod1.apple.com/paymentservices/startSession",
  ]) assert.ok(isAppleValidationUrl(ok), ok);
  for (const bad of [
    "https://evil.example/paymentservices/startSession",
    "https://apple-pay-gateway.apple.com.evil.example/paymentservices/startSession",
    "http://apple-pay-gateway.apple.com/paymentservices/startSession",
    "https://apple-pay-gateway.apple.com:8443/paymentservices/startSession",
    "https://apple-pay-gateway.apple.com/other",
    "https://user@apple-pay-gateway.apple.com/paymentservices/startSession",
  ]) assert.equal(isAppleValidationUrl(bad), false, bad);

  const settings = { merchantIdentifier: "merchant.bg.pizzapazzo", displayName: "Pizza Pazzo", domain: "pizzapazzo.bg", countryCode: "BG", identityCertPem: "CERT", identityKeyPem: "KEY" };
  let seen: { url: string; body: string; tls: { cert: string; key: string } } | null = null;
  const session = await requestAppleMerchantSession(settings, "https://apple-pay-gateway.apple.com/paymentservices/startSession", async (url, body, tls) => {
    seen = { url, body, tls };
    return { status: 200, text: JSON.stringify({ merchantSessionIdentifier: "S", signature: "x" }) };
  });
  assert.deepEqual(session, { merchantSessionIdentifier: "S", signature: "x" });
  assert.deepEqual(JSON.parse(seen!.body), { merchantIdentifier: "merchant.bg.pizzapazzo", displayName: "Pizza Pazzo", initiative: "web", initiativeContext: "pizzapazzo.bg" });
  assert.deepEqual(seen!.tls, { cert: "CERT", key: "KEY" });
  let called = false;
  const refused = await requestAppleMerchantSession(settings, "https://evil.example/paymentservices/startSession", async () => {
    called = true;
    return { status: 200, text: "{}" };
  });
  assert.equal(refused, null);
  assert.equal(called, false, "our client certificate is never sent to a foreign host");
});

// ── Flow ─────────────────────────────────────────────────────────────────

test("Google Pay paid: the attempt's own OrderID/PurchaseTime, the stored amount; PAID only after the signed status query; to the kitchen once", async () => {
  const o = await staffCardOrder();
  const { result, logs } = await captureLogs(() => pay(o.accessToken));
  assert.deepEqual(result, { ok: true, state: "PAID" });
  assert.equal(walletCalls.length, 1);
  const [a] = await attempts(o.orderNumber);
  const sent = JSON.parse(a.redirectFormJson!) as Record<string, string>;
  const p = walletCalls[0].payload;
  assert.equal(walletCalls[0].url, "https://secure.kbcbank.bg/kbc/payByWallet");
  assert.equal(walletCalls[0].header, JSON.stringify({ alg: "RS256" }));
  assert.equal(p.MerchantID, MID);
  assert.equal(p.TerminalID, TID);
  assert.equal(p.OrderID, a.reference);
  assert.equal(p.PurchaseTime, sent.PurchaseTime);
  assert.equal(p.TotalAmount, STANDARD_TOTAL_MINOR);
  assert.equal(p.Currency, 978);
  assert.equal(p.Wallet, "GOOGLE_PAY");
  assert.equal(p.WalletData, GOOGLE_TOKEN);
  assert.equal(a.status, "PAID");
  assert.equal(a.walletType, "GOOGLE_PAY");
  assert.equal(a.walletSubmissions, 1);
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: o.orderNumber } });
  assert.equal(order.paymentStatus, "PAID");
  assert.equal(order.isTest, false);
  assert.ok(order.releasedToKitchenAt, "a confirmed real payment releases the order");
  const released = order.releasedToKitchenAt!.getTime();
  assert.doesNotMatch(logs, new RegExp(MARKER), "the wallet token is never logged");
  assert.doesNotMatch(a.providerResponse ?? "", new RegExp(MARKER), "nor stored");

  // A second tap after the payment: nothing is sent.
  const again = await pay(o.accessToken);
  assert.deepEqual(again, { ok: false, code: "ALREADY_PAID" });
  assert.equal(walletCalls.length, 1);
  const later = await db.order.findUniqueOrThrow({ where: { orderNumber: o.orderNumber } });
  assert.equal(later.releasedToKitchenAt!.getTime(), released, "released once, not again");
});

test("a wallet answer that says 000 is NOT a payment: without the bank's status (408) the attempt stays pending", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => signedAnswer("000"); // the status query still says 408
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PENDING" });
  const [a] = await attempts(o.orderNumber);
  assert.notEqual(a.status, "PAID");
  // A second tap right away is held: UPC may still be booking the first one.
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "CHECKING" });
  assert.equal(walletCalls.length, 1, "nothing re-sent while the first answer is unclear");
  // An unsigned "000" is no better.
  const o2 = await staffCardOrder();
  walletAnswer = () => "TranCode=000\n";
  assert.deepEqual(await pay(o2.accessToken), { ok: true, state: "PENDING" });
  assert.equal((await db.order.findUniqueOrThrow({ where: { orderNumber: o2.orderNumber } })).paymentStatus === "PAID", false);
});

test("settle window: after an unclear answer no new wallet data for WALLET_SETTLE_MS, even if the status says 408; then the SAME OrderID", async () => {
  const o = await staffCardOrder();
  walletAnswer = new Error("The operation was aborted due to timeout");
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PENDING" });
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "CHECKING" });
  assert.equal(walletCalls.length, 1);
  // The window has passed and the bank still has nothing under this OrderID.
  const [a] = await attempts(o.orderNumber);
  await db.paymentAttempt.update({ where: { id: a.id }, data: { walletSubmittedAt: new Date(Date.now() - WALLET_SETTLE_MS - 1_000) } });
  walletAnswer = () => {
    statusCode = "000";
    return signedAnswer("000");
  };
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PAID" });
  assert.deepEqual(walletCalls.map((c) => c.payload.OrderID), [a.reference, a.reference], "never a second OrderID");
  assert.equal((await attempts(o.orderNumber)).length, 1);
});

test("status says PAID but for another amount: never paid, AMOUNT_MISMATCH for staff", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => {
    statusCode = "000";
    statusAmount = 100;
    return signedAnswer("000");
  };
  const r = await pay(o.accessToken);
  assert.equal(r.ok && r.state, "PENDING");
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: o.orderNumber } });
  assert.notEqual(order.paymentStatus, "PAID");
  assert.equal(order.paymentAlert, "AMOUNT_MISMATCH");
});

test("refused (ERROR=…) and not found at the bank: DECLINED, nothing taken; the retry and the card page keep the SAME OrderID", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => "ERROR=Undefined error";
  const { result, logs } = await captureLogs(() => pay(o.accessToken));
  assert.deepEqual(result, { ok: true, state: "DECLINED" });
  assert.doesNotMatch(logs, new RegExp(MARKER));
  const [first] = await attempts(o.orderNumber);
  assert.equal(first.status, "PENDING", "still open — it can still be paid once");

  walletAnswer = () => {
    statusCode = "000";
    return signedAnswer("000");
  };
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PAID" });
  const all = await attempts(o.orderNumber);
  assert.equal(all.length, 1, "one OrderID for the whole order");
  assert.deepEqual(walletCalls.map((c) => c.payload.OrderID), [first.reference, first.reference]);
});

test("the card page and the wallet share one OrderID: a wallet after an opened card page re-uses it", async () => {
  const o = await staffCardOrder();
  const start = await startCardPayment({ accessToken: o.accessToken, locale: "bg" });
  assert.equal(start.ok, true);
  const cardOrderId = start.ok ? start.redirect.postFields!.OrderID : "";
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PAID" });
  assert.equal(walletCalls[0].payload.OrderID, cardOrderId);
  assert.equal((await attempts(o.orderNumber)).length, 1);
});

test("declined by the bank (status 105): FAILED; the next tap is a NEW OrderID", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => {
    statusCode = "105";
    return signedAnswer("105");
  };
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "FAILED" });
  walletAnswer = () => {
    statusCode = "000";
    return signedAnswer("000");
  };
  // The status query for the NEW OrderID finds the new payment.
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PAID" });
  const all = await attempts(o.orderNumber);
  assert.equal(all.length, 2);
  assert.notEqual(all[0].reference, all[1].reference);
  assert.deepEqual(all.map((a) => a.status), ["FAILED", "PAID"]);
});

test("no answer from UPC (timeout): PENDING, never DECLINED; no second OrderID while it is unclear", async () => {
  const o = await staffCardOrder();
  walletAnswer = new Error("The operation was aborted due to timeout");
  const { result, logs } = await captureLogs(() => pay(o.accessToken));
  assert.deepEqual(result, { ok: true, state: "PENDING" });
  assert.doesNotMatch(logs, new RegExp(MARKER));
  // The bank had in fact taken it: the next check settles it, no new payment.
  statusCode = "000";
  const card = await startCardPayment({ accessToken: o.accessToken, locale: "bg" });
  assert.deepEqual(card, { ok: false, code: "ALREADY_PAID" });
  assert.equal((await attempts(o.orderNumber)).length, 1);
});

test("a technical status (291 found, still processing) blocks both a wallet retry and a new card page: CHECKING", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => {
    statusCode = "290";
    return "<html>…</html>";
  };
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PENDING" });
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "CHECKING" });
  assert.deepEqual(await startCardPayment({ accessToken: o.accessToken, locale: "bg" }), { ok: false, code: "CHECKING" });
  assert.equal(walletCalls.length, 1);
});

test("double tap / two tabs at once: one payByWallet call, one payment", async () => {
  const o = await staffCardOrder();
  const results = await Promise.all([pay(o.accessToken), pay(o.accessToken), pay(o.accessToken)]);
  assert.equal(walletCalls.length, 1, JSON.stringify(results));
  assert.equal(results.filter((r) => r.ok && r.state === "PAID").length, 1);
  for (const r of results.filter((r) => !(r.ok && r.state === "PAID"))) {
    assert.ok(!r.ok && ["BUSY", "ALREADY_PAID", "CHECKING"].includes(r.code), JSON.stringify(r));
  }
  assert.equal((await attempts(o.orderNumber)).filter((a) => a.status === "PAID").length, 1);
});

test("refusals before any bank call: bad token data, wallet switched off, Apple Pay not configured, too many submissions", async () => {
  const o = await staffCardOrder();
  assert.deepEqual(await pay(o.accessToken, "GOOGLE_PAY", "{}"), { ok: false, code: "INVALID_WALLET_DATA" });
  assert.deepEqual(await pay(o.accessToken, "APPLE_PAY", APPLE_TOKEN), { ok: false, code: "DISABLED" });
  process.env.GOOGLE_PAY_ENABLED = "false";
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "DISABLED" });
  process.env.GOOGLE_PAY_ENABLED = "true";
  assert.equal(walletCalls.length, 0);
  assert.equal((await attempts(o.orderNumber)).length, 0, "no attempt for a refused wallet tap");

  walletAnswer = () => "ERROR=Undefined error";
  for (let i = 0; i < MAX_WALLET_SUBMISSIONS; i++) assert.deepEqual(await pay(o.accessToken), { ok: true, state: "DECLINED" });
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "TOO_MANY_ATTEMPTS" });
  assert.equal(walletCalls.length, MAX_WALLET_SUBMISSIONS);
});

test("a cancelled order and a test (isTest) order are never offered a wallet", async () => {
  const o = await staffCardOrder();
  await db.order.update({ where: { orderNumber: o.orderNumber }, data: { status: "CANCELLED" } });
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "ORDER_CANCELLED" });
  assert.ok(resolveWalletOffer({ isTest: false }));
  assert.equal(resolveWalletOffer({ isTest: true }), null, "a test order never reaches the production terminal");
  assert.equal(walletCalls.length, 0);
});

test("Google Pay TEST preview: refused before anything is created; nothing reaches the bank", async () => {
  process.env.GOOGLE_PAY_ENVIRONMENT = "TEST";
  const o = await staffCardOrder();
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "PREVIEW_ONLY" });
  assert.equal(walletCalls.length, 0);
  assert.equal((await attempts(o.orderNumber)).length, 0);
});

test("3-D Secure / redirect answer: never followed, PENDING; a later status 000 settles it without a second charge", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => "<html><form action='https://acs.example/3ds'></form></html>";
  const { result, logs } = await captureLogs(() => pay(o.accessToken));
  assert.deepEqual(result, { ok: true, state: "PENDING" });
  assert.match(logs, /3-D Secure\/redirect step/);
  assert.doesNotMatch(logs, new RegExp(MARKER));
  statusCode = "000";
  assert.deepEqual(await startCardPayment({ accessToken: o.accessToken, locale: "bg" }), { ok: false, code: "ALREADY_PAID" });
  assert.equal(walletCalls.length, 1);
  assert.equal((await attempts(o.orderNumber)).length, 1);
});

test("999 'in progress': PENDING, and a retry is held while the bank still processes it", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => {
    statusCode = "999";
    return signedAnswer("999");
  };
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PENDING" });
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "CHECKING" });
  assert.equal(walletCalls.length, 1);
});

test("a signed decline UPC registered (116): FAILED, never PAID, nothing to the kitchen", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => {
    statusCode = "116";
    return signedAnswer("116");
  };
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "FAILED" });
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: o.orderNumber } });
  assert.notEqual(order.paymentStatus, "PAID");
  assert.equal(order.releasedToKitchenAt, null);
});
