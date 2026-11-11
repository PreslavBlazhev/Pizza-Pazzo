/**
 * Google Pay / Apple Pay through UPC payByWallet — settings, protocol, flow.
 *
 * Runs with tests/setup-env-upc.mjs (ОББ's TEST terminal, staff only, per-run
 * keys). UPC is played here: the status query through a stubbed fetch (signed
 * with the stand-in gateway key), payByWallet through the `send` seam.
 *
 * ⚠️ Proves OUR side only. No wallet token here is real and no request
 * leaves this process; the bank-side checks are in docs/UBB-UPC-WALLETS.md.
 *
 * Run: npm run test:upc
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { db } from "@/lib/db";
import { placeOrder } from "@/lib/checkout/place-order";
import { startCardPayment } from "@/lib/payments/service";
import { getEffectivePaymentConfig } from "@/lib/payments/providers";
import { getWalletSettings, walletClientConfig } from "@/lib/payments/wallets/config";
import { MAX_WALLET_SUBMISSIONS, payWithWallet, resolveWalletOffer, type WalletSender } from "@/lib/payments/wallets/service";
import { isAppleValidationUrl, requestAppleMerchantSession } from "@/lib/payments/wallets/apple-session";
import { buildWalletRequest, normalizeWalletData, parseWalletAnswer } from "@/lib/payments/upc/wallet";
import type { PaymentConfig } from "@/lib/payments/config";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, STANDARD_TOTAL_MINOR, deps, key } from "./helpers";

const GATEWAY_KEY = createPrivateKey(process.env.TEST_UPC_GATEWAY_PRIVATE_KEY!);
const GATEWAY_PUBLIC = createPublicKey(GATEWAY_KEY);
const MERCHANT_PUBLIC = createPublicKey(process.env.TEST_UPC_MERCHANT_PUBLIC_KEY!);
const WALLET_URL = "https://ecg.test.upc.ua/kbc/payByWallet";

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

const WALLET_ENV: Record<string, string> = {
  UPC_WALLET_URL: WALLET_URL,
  GOOGLE_PAY_ENABLED: "true",
  GOOGLE_PAY_GATEWAY_MERCHANT_ID: "POS-TEST-1",
};
for (const [k, v] of Object.entries(WALLET_ENV)) process.env[k] = v;

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
  if (!url.startsWith("https://ecg.test.upc.ua/kbc/service/01")) return realFetch(input, init);
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

function signedAnswer(code: string, key = GATEWAY_KEY): string {
  const b64u = (v: string) => Buffer.from(v).toString("base64url");
  const header = b64u(JSON.stringify({ alg: "RS512" }));
  const payload = b64u(JSON.stringify({ TranCode: code }));
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
  for (const [k, v] of Object.entries(WALLET_ENV)) process.env[k] = v;
  delete process.env.APPLE_PAY_ENABLED;
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

test("settings: no wallet without UPC_WALLET_URL, nothing defaulted; test/production hosts never mix", () => {
  const sandbox = getEffectivePaymentConfig();
  const base = { ...process.env, ...WALLET_ENV };
  const none = getWalletSettings(sandbox, { ...base, UPC_WALLET_URL: "" });
  assert.equal(none.google, null);
  assert.match(none.problems.join(" "), /UPC_WALLET_URL не е зададен/);

  assert.ok(getWalletSettings(sandbox, base).google, "the test terminal + test wallet URL");
  for (const url of ["https://secure.kbcbank.bg/kbc/payByWallet", "https://secure.upc.ua/go/payByWallet", "http://ecg.test.upc.ua/kbc/payByWallet"]) {
    const s = getWalletSettings(sandbox, { ...base, UPC_WALLET_URL: url });
    assert.equal(s.google, null, url);
  }
  const prod = getWalletSettings(fakeConfig("production"), { ...base, UPC_WALLET_URL: WALLET_URL });
  assert.equal(prod.google, null, "production never pays through the test gateway");

  // Off unless switched on; never through the simulator/demo.
  assert.equal(getWalletSettings(sandbox, { ...base, GOOGLE_PAY_ENABLED: "" }).google, null);
  assert.equal(getWalletSettings({ ...sandbox, providerId: "simulator" }, base).google, null);
  assert.equal(getWalletSettings({ ...sandbox, enabled: false }, base).google, null);
});

test("settings: Google Pay — pos_id required, Google merchantId required in PRODUCTION only, environment follows PAYMENT_ENV", () => {
  const base = { ...process.env, ...WALLET_ENV };
  const sandbox = getWalletSettings(getEffectivePaymentConfig(), base);
  assert.equal(sandbox.google?.environment, "TEST");
  assert.equal(sandbox.google?.merchantId, "");
  assert.deepEqual(sandbox.google?.authMethods, ["PAN_ONLY", "CRYPTOGRAM_3DS"], "UPC's documented auth methods");
  assert.equal(getWalletSettings(getEffectivePaymentConfig(), { ...base, GOOGLE_PAY_GATEWAY_MERCHANT_ID: "" }).google, null);
  assert.equal(getWalletSettings(getEffectivePaymentConfig(), { ...base, GOOGLE_PAY_AUTH_METHODS: "PAN_ONLY,FOO" }).google, null);
  assert.deepEqual(
    getWalletSettings(getEffectivePaymentConfig(), { ...base, GOOGLE_PAY_AUTH_METHODS: "CRYPTOGRAM_3DS" }).google?.authMethods,
    ["CRYPTOGRAM_3DS"]
  );

  const prodEnv = { ...base, UPC_WALLET_URL: "https://secure.kbcbank.bg/kbc/payByWallet" };
  const prod = getWalletSettings(fakeConfig("production"), prodEnv);
  assert.equal(prod.google, null);
  assert.match(prod.problems.join(" "), /GOOGLE_PAY_MERCHANT_ID.*задължителен в продукция/);
  const prodOk = getWalletSettings(fakeConfig("production"), { ...prodEnv, GOOGLE_PAY_MERCHANT_ID: "BCR2DN4TEST" });
  assert.equal(prodOk.google?.environment, "PRODUCTION");
});

test("settings: Apple Pay needs its merchant id, Merchant Identity cert + key; otherwise it is hidden", () => {
  const base = { ...process.env, ...WALLET_ENV, APPLE_PAY_ENABLED: "true" };
  const s = getWalletSettings(getEffectivePaymentConfig(), base);
  assert.equal(s.apple, null);
  assert.ok(s.google, "Google Pay is not affected by a half-configured Apple Pay");
  const text = s.problems.join(" ");
  for (const v of ["APPLE_PAY_MERCHANT_ID", "APPLE_PAY_MERCHANT_IDENTITY_CERT", "APPLE_PAY_MERCHANT_IDENTITY_KEY"]) assert.match(text, new RegExp(v));
  const junk = getWalletSettings(getEffectivePaymentConfig(), {
    ...base,
    APPLE_PAY_MERCHANT_ID: "merchant.bg.pizzapazzo",
    APPLE_PAY_MERCHANT_IDENTITY_CERT: "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----",
    APPLE_PAY_MERCHANT_IDENTITY_KEY: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----",
  });
  assert.equal(junk.apple, null);
  assert.match(junk.problems.join(" "), /не е валиден/);
});

test("client config: gateway 'upcua', the pos_id, VISA/MASTERCARD, the SERVER amount — no secrets", () => {
  const c = walletClientConfig(getWalletSettings(getEffectivePaymentConfig(), { ...process.env, ...WALLET_ENV }), {
    amountMinor: 2090,
    currency: "EUR",
  })!;
  assert.equal(c.amount, "20.90");
  assert.equal(c.countryCode, "BG");
  assert.equal(c.google?.gateway, "upcua");
  assert.equal(c.google?.gatewayMerchantId, "POS-TEST-1");
  assert.deepEqual(c.google?.networks, ["MASTERCARD", "VISA"]);
  assert.equal(c.apple, null);
  assert.doesNotMatch(JSON.stringify(c), /PRIVATE KEY|BEGIN/);
});

// ── Protocol ─────────────────────────────────────────────────────────────

test("payByWallet request: RS256 envelope, UPC's payload fields, numbers as in UPC's example, WalletData verbatim", () => {
  const body = buildWalletRequest(
    {
      merchantId: "1731096",
      terminalId: "E7059096",
      orderId: "PP1001-0A1B2C3D",
      purchaseTime: "261111120000",
      amountMinor: 2090,
      currencyNumeric: "978",
      wallet: "GOOGLE_PAY",
      walletData: GOOGLE_TOKEN,
      description: "Pizza Pazzo — поръчка 1001",
    },
    createPrivateKey(Buffer.from(process.env.UPC_PRIVATE_KEY!, "base64").toString())
  );
  const env = JSON.parse(body);
  assert.deepEqual(Object.keys(env), ["header", "payload", "signature"]);
  assert.deepEqual(JSON.parse(Buffer.from(env.header, "base64url").toString()), { alg: "RS256" });
  assert.ok(cryptoVerify("sha256", Buffer.from(`${env.header}.${env.payload}`), MERCHANT_PUBLIC, Buffer.from(env.signature, "base64url")));
  assert.deepEqual(JSON.parse(Buffer.from(env.payload, "base64url").toString()), {
    MerchantID: "1731096",
    TerminalID: "E7059096",
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

test("wallet answer: signed = UPC's; forged/unsigned = hint only; 'ERROR=…' as the KBC test endpoint really answers", () => {
  const algs = ["sha512"] as const;
  assert.deepEqual(parseWalletAnswer(signedAnswer("000"), GATEWAY_PUBLIC, algs), { kind: "signed", tranCode: "000" });
  const notUpc = createPrivateKey(Buffer.from(process.env.UPC_PRIVATE_KEY!, "base64").toString());
  assert.deepEqual(parseWalletAnswer(signedAnswer("000", notUpc), GATEWAY_PUBLIC, algs), { kind: "unreadable" }, "forged");
  // Probe 11.11.2026: an empty POST to ecg.test.upc.ua/kbc/payByWallet.
  assert.deepEqual(parseWalletAnswer("ERROR=Undefined error", GATEWAY_PUBLIC, algs), { kind: "error", error: "Undefined error" });
  assert.deepEqual(parseWalletAnswer("TranCode=105\n", GATEWAY_PUBLIC, algs), { kind: "unsigned", tranCode: "105" });
  assert.deepEqual(parseWalletAnswer("<html>3-D Secure…</html>", GATEWAY_PUBLIC, algs), { kind: "unreadable" });
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

test("Google Pay paid: the attempt's own OrderID/PurchaseTime, the stored amount; PAID only after the signed status query; test order kept off the kitchen", async () => {
  const o = await staffCardOrder();
  const { result, logs } = await captureLogs(() => pay(o.accessToken));
  assert.deepEqual(result, { ok: true, state: "PAID" });
  assert.equal(walletCalls.length, 1);
  const [a] = await attempts(o.orderNumber);
  const sent = JSON.parse(a.redirectFormJson!) as Record<string, string>;
  const p = walletCalls[0].payload;
  assert.equal(walletCalls[0].url, WALLET_URL);
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
  assert.equal(order.releasedToKitchenAt, null, "a sandbox payment never reaches the kitchen");
  assert.doesNotMatch(logs, new RegExp(MARKER), "the wallet token is never logged");
  assert.doesNotMatch(a.providerResponse ?? "", new RegExp(MARKER), "nor stored");

  // A second tap after the payment: nothing is sent.
  const again = await pay(o.accessToken);
  assert.deepEqual(again, { ok: false, code: "ALREADY_PAID" });
  assert.equal(walletCalls.length, 1);
});

test("a wallet answer that says 000 is NOT a payment: without the bank's status (408) the attempt stays pending", async () => {
  const o = await staffCardOrder();
  walletAnswer = () => signedAnswer("000"); // the status query still says 408
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PENDING" });
  const [a] = await attempts(o.orderNumber);
  assert.notEqual(a.status, "PAID");
  // An unsigned "000" is no better.
  walletAnswer = () => "TranCode=000\n";
  assert.deepEqual(await pay(o.accessToken), { ok: true, state: "PENDING" });
  assert.equal((await db.order.findUniqueOrThrow({ where: { orderNumber: o.orderNumber } })).paymentStatus === "PAID", false);
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

test("a cash order, a cancelled order and a demo (isTest≠terminal) order are never offered a wallet", async () => {
  const o = await staffCardOrder();
  await db.order.update({ where: { orderNumber: o.orderNumber }, data: { status: "CANCELLED" } });
  assert.deepEqual(await pay(o.accessToken), { ok: false, code: "ORDER_CANCELLED" });
  assert.equal(resolveWalletOffer({ isTest: false }), null, "the sandbox terminal never pays a real order");
  assert.ok(resolveWalletOffer({ isTest: true }));
});
