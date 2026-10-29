/**
 * ОББ virtual POS on UPC e-Commerce Connect — protocol and flow.
 *
 * Runs with tests/setup-env-upc.mjs: APP_ENV=production + ОББ's TEST terminal
 * (PAYMENT_ENV=sandbox, staff only), a fresh SQLite database, per-run keys.
 * UPC's gateway is played by this file: it signs NOTIFY messages with a
 * stand-in gateway key and answers the status query through a stubbed fetch.
 *
 * ⚠️ This proves OUR side — signing, verification, decisions, idempotency,
 * the kitchen gate. It is NOT a bank test: the real sandbox runs are recorded
 * in docs/UBB-UPC-TEST-REPORT.md.
 *
 * Run: npm run test:upc
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { db } from "@/lib/db";
import { placeOrder } from "@/lib/checkout/place-order";
import { startCardPayment, syncAttempt } from "@/lib/payments/service";
import { handleUpcNotify } from "@/lib/payments/upc/notify";
import { resolveUpcBrowserReturn } from "@/lib/payments/upc/browser-return";
import { reconcileOpenPayments } from "@/lib/payments/reconcile";
import { getPaymentAttention, upcPortalUrls } from "@/lib/payments/admin";
import { releaseHeldPaidOrder } from "@/lib/payments/staff";
import { getEffectivePaymentConfig, resolveCheckoutPayment } from "@/lib/payments/providers";
import { buildUpcPaymentForm } from "@/lib/payments/providers/upc";
import { getUpcSettings, UPC_SANDBOX_GATEWAY_URL, UPC_SANDBOX_STATUS_URL } from "@/lib/payments/upc/config";
import { UPC_TEST_GATEWAY_CERT_SHA256 } from "@/lib/payments/upc/certs";
import {
  buildNotifyResponse,
  failureSignatureData,
  formatPurchaseTime,
  gatewaySignatureData,
  outcomeForTranCode,
  parseKeyValueText,
  requestSignatureData,
  signBase64,
  verifyBase64,
  type UpcFields,
} from "@/lib/payments/upc/protocol";
import { getPendingOrders } from "@/lib/orders";
import { ALL_CONSENTS, CONTACT, STANDARD_ITEMS, STANDARD_TOTAL_MINOR, deps, key, quiet } from "./helpers";

const GATEWAY_KEY = createPrivateKey(process.env.TEST_UPC_GATEWAY_PRIVATE_KEY!);
const MERCHANT_PUBLIC = createPublicKey(process.env.TEST_UPC_MERCHANT_PUBLIC_KEY!);
const STAFF = { id: "staff-1", email: "staff@example.test", role: "ADMIN" };

after(async () => {
  await db.$disconnect();
});

// ── The stand-in gateway ────────────────────────────────────────────────

type StatusAnswer = string | (() => string) | Error;
let statusAnswer: StatusAnswer = "TranCode=408\n";
const statusCalls: { url: string; body: URLSearchParams }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://ecg.test.upc.ua/")) return realFetch(input, init);
  statusCalls.push({ url, body: new URLSearchParams(String(init?.body ?? "")) });
  const a = typeof statusAnswer === "function" ? statusAnswer() : statusAnswer;
  if (a instanceof Error) throw a;
  return new Response(a, { status: 200, headers: { "Content-Type": "text/html;charset=UTF-8" } });
}) as typeof fetch;

beforeEach(() => {
  statusAnswer = "TranCode=408\n";
  statusCalls.length = 0;
});

/** A NOTIFY / return exactly as UPC would sign it for this attempt. */
function gatewayMessage(
  sent: Record<string, string>,
  overrides: Partial<UpcFields> = {},
  options: { sign?: boolean; algorithm?: "sha512" | "sha1"; signWith?: ReturnType<typeof createPrivateKey> } = {}
): UpcFields {
  const fields: UpcFields = {
    MerchantID: sent.MerchantID,
    TerminalID: sent.TerminalID,
    PurchaseTime: sent.PurchaseTime,
    OrderID: sent.OrderID,
    XID: "26102918-123456",
    Currency: sent.Currency,
    TotalAmount: sent.TotalAmount,
    SD: "",
    TranCode: "000",
    ApprovalCode: "123456",
    Rrn: "630218123456",
    ProxyPan: "499999******0011",
    ...overrides,
  };
  if (options.sign !== false) {
    fields.Signature = signBase64(
      gatewaySignatureData(fields),
      options.signWith ?? GATEWAY_KEY,
      options.algorithm ?? "sha512"
    );
  }
  return fields;
}

const body = (f: UpcFields) => new URLSearchParams(f).toString();

async function staffCardOrder() {
  const r = await placeOrder(
    {
      contact: CONTACT,
      itemsJson: STANDARD_ITEMS,
      paymentMethod: "card_online",
      checkoutKey: key(),
      userId: null,
      consents: ALL_CONSENTS,
      role: "STAFF",
    },
    deps
  );
  if (!r.ok || !r.accessToken) throw new Error(`placeOrder failed: ${JSON.stringify(r)}`);
  return r as typeof r & { accessToken: string };
}

async function startAndSent(token: string) {
  const start = await startCardPayment({ accessToken: token, locale: "bg" });
  assert.equal(start.ok, true, JSON.stringify(start));
  if (!start.ok) throw new Error("unreachable");
  return { start, sent: start.redirect.postFields! };
}

async function latestAttempt(orderNumber: number) {
  return db.paymentAttempt.findFirstOrThrow({ where: { order: { orderNumber } }, orderBy: { createdAt: "desc" } });
}

async function orderRow(orderNumber: number) {
  return db.order.findUniqueOrThrow({ where: { orderNumber } });
}

// ── Protocol: the exact strings ─────────────────────────────────────────

test("request signature string: MerchantID;TerminalID;PurchaseTime;OrderID;Currency;TotalAmount;SD; with the trailing ;", () => {
  const f = { MerchantID: "1731096", TerminalID: "E7059096", PurchaseTime: "261029203000", OrderID: "PP1001-0A1B2C3D", Currency: "978", TotalAmount: "2090" };
  assert.equal(requestSignatureData(f), "1731096;E7059096;261029203000;PP1001-0A1B2C3D;978;2090;;");
  assert.equal(requestSignatureData({ ...f, SD: "x" }), "1731096;E7059096;261029203000;PP1001-0A1B2C3D;978;2090;x;");
});

test("gateway signature strings: Delay/Alt fields join with a comma only when present; failure form", () => {
  const f: UpcFields = { MerchantID: "1", TerminalID: "E1", PurchaseTime: "t", OrderID: "O", XID: "X", Currency: "978", TotalAmount: "100", SD: "", TranCode: "000", ApprovalCode: "A" };
  assert.equal(gatewaySignatureData(f), "1;E1;t;O;X;978;100;;000;A;");
  assert.equal(gatewaySignatureData({ ...f, Delay: "1", AltCurrency: "975", AltTotalAmount: "196" }), "1;E1;t;O,1;X;978,975;100,196;;000;A;");
  assert.equal(failureSignatureData({ ...f, TranCode: "105" }), "1;E1;t;O;;X;978;100;105;");
});

test("PurchaseTime is Sofia wall-clock yyMMddHHmmss (summer +3, winter +2)", () => {
  assert.equal(formatPurchaseTime(new Date("2026-07-01T09:00:05Z")), "260701120005");
  assert.equal(formatPurchaseTime(new Date("2026-12-01T09:00:05Z")), "261201110005");
  assert.equal(formatPurchaseTime(new Date("2026-10-29T21:59:59Z")), "261029235959");
});

test("RSA signatures: verify with the right key/hash only; tampering fails; garbage never throws", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const data = "1731096;E7059096;261029203000;PP1001-0A1B2C3D;978;2090;;";
  const s512 = signBase64(data, privateKey, "sha512");
  assert.equal(verifyBase64(data, s512, publicKey, ["sha512", "sha1"]), "sha512");
  assert.equal(verifyBase64(data, signBase64(data, privateKey, "sha1"), publicKey, ["sha512", "sha1"]), "sha1");
  assert.equal(verifyBase64(data, signBase64(data, privateKey, "sha1"), publicKey, ["sha512"]), null, "an unlisted hash is refused");
  assert.equal(verifyBase64(data.replace("2090", "2091"), s512, publicKey, ["sha512"]), null);
  assert.equal(verifyBase64(data, s512, other.publicKey, ["sha512"]), null);
  for (const junk of ["", "%%%", "AAAA", "x".repeat(5000)]) assert.equal(verifyBase64(data, junk, publicKey, ["sha512"]), null);
});

test("TranCode → state: only 000 is money; 408/unknown stay pending", () => {
  assert.equal(outcomeForTranCode("000"), "PAID");
  for (const c of ["105", "116", "101", "111", "108", "130", "290", "291", "404", "405"]) assert.equal(outcomeForTranCode(c), "FAILED", c);
  for (const c of ["501", "503", "504", "601"]) assert.equal(outcomeForTranCode(c), "CANCELLED", c);
  assert.equal(outcomeForTranCode("502"), "EXPIRED");
  for (const c of ["408", "410", "999x", ""]) assert.equal(outcomeForTranCode(c), "PENDING", c);
});

test("status answer as the KBC test gateway really answers (probe 29.10.2026) and as hidden inputs", () => {
  const observed = "TranCode=408\nCurrency=978\nTerminalID=E7059096\nMerchantID=1731096\nOrderID=PPPROBE-0001\n";
  assert.deepEqual(parseKeyValueText(observed), {
    TranCode: "408",
    Currency: "978",
    TerminalID: "E7059096",
    MerchantID: "1731096",
    OrderID: "PPPROBE-0001",
  });
  const html = `<form><input name="TranCode" type="hidden" value="000" /><input name="CardScheme" type="hidden" value="VISA"/></form>`;
  assert.deepEqual(parseKeyValueText(html), { TranCode: "000", CardScheme: "VISA" });
});

test("NOTIFY answer: Parameter=Value lines, \\n separated, Response.action/.reason/.forwardUrl", () => {
  const f: UpcFields = { MerchantID: "1731096", TerminalID: "E7059096", OrderID: "PP1-AB", Currency: "978", TotalAmount: "2090", XID: "X1", PurchaseTime: "261029203000" };
  assert.equal(
    buildNotifyResponse(f, "approve", "ok", "https://pizzapazzo.bg/api/payments/return?t=abc"),
    "MerchantID=1731096\nTerminalID=E7059096\nOrderID=PP1-AB\nCurrency=978\nTotalAmount=2090\nXID=X1\n" +
      "PurchaseTime=261029203000\nResponse.action=approve\nResponse.reason=ok\n" +
      "Response.forwardUrl=https://pizzapazzo.bg/api/payments/return?t=abc\n"
  );
  assert.match(buildNotifyResponse({ ...f, OrderID: "a\nResponse.action=approve" }, "reverse", "x\ny", null), /^OrderID=a Response\.action=approve$/m, "no line injection");
});

test("payment form: exact fields, our signature verifies, EUR=978, bg locale, ASCII description", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const form = buildUpcPaymentForm(
    { merchantId: "1731096", terminalId: "E7059096", privateKey, requestAlgorithm: "sha512" },
    { reference: "PP1001-0A1B2C3D", amountMinor: 2090, currency: "EUR", locale: "bg", description: "Pizza Pazzo — поръчка №1001" },
    new Date("2026-10-29T18:30:00Z")
  );
  assert.deepEqual(Object.keys(form), ["Version", "MerchantID", "TerminalID", "PurchaseTime", "OrderID", "Currency", "TotalAmount", "locale", "PurchaseDesc", "Signature"]);
  assert.equal(form.Currency, "978");
  assert.equal(form.PurchaseTime, "261029203000", "29.10 is winter time in Sofia (UTC+2)");
  assert.equal(form.locale, "bg");
  assert.equal(form.PurchaseDesc, "Pizza Pazzo 1001");
  assert.equal(verifyBase64("1731096;E7059096;261029203000;PP1001-0A1B2C3D;978;2090;;", form.Signature, publicKey, ["sha512"]), "sha512");
  assert.throws(() => buildUpcPaymentForm({ merchantId: "1", terminalId: "E", privateKey, requestAlgorithm: "sha512" }, { reference: "X".repeat(21), amountMinor: 1, currency: "EUR", locale: "bg", description: "" }));
  assert.throws(() => buildUpcPaymentForm({ merchantId: "1", terminalId: "E", privateKey, requestAlgorithm: "sha512" }, { reference: "OK", amountMinor: 1, currency: "UAH", locale: "bg", description: "" }), "no 980 from UPC's examples");
});

// ── Configuration ───────────────────────────────────────────────────────

test("settings: sandbox defaults are the KBC test URLs + UPC's published test certificate; production defaults nothing", () => {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const base = { UPC_MERCHANT_ID: "1731096", UPC_TERMINAL_ID: "E7059096", UPC_PRIVATE_KEY: key } as unknown as NodeJS.ProcessEnv;
  const s = getUpcSettings("sandbox", base);
  assert.deepEqual(s.problems, []);
  assert.equal(s.settings!.gatewayUrl, UPC_SANDBOX_GATEWAY_URL);
  assert.equal(s.settings!.statusUrl, UPC_SANDBOX_STATUS_URL);
  assert.equal(UPC_SANDBOX_GATEWAY_URL, "https://ecg.test.upc.ua/kbc/pay");
  assert.equal(UPC_SANDBOX_STATUS_URL, "https://ecg.test.upc.ua/kbc/service/01", "not the /go/ example address");
  assert.equal(s.settings!.gatewayCertSha256, UPC_TEST_GATEWAY_CERT_SHA256);
  assert.deepEqual(s.settings!.gatewayAlgorithms, ["sha512", "sha1"]);

  const prod = getUpcSettings("production", base);
  assert.equal(prod.settings, null);
  for (const n of ["UPC_GATEWAY_URL", "UPC_STATUS_URL", "UPC_GATEWAY_CERT", "UPC_GATEWAY_SIGNATURE_ALGS"]) {
    assert.ok(prod.problems.some((p) => p.includes(n)), n);
  }
  const prodOnTest = getUpcSettings("production", { ...base, UPC_GATEWAY_URL: UPC_SANDBOX_GATEWAY_URL, UPC_STATUS_URL: UPC_SANDBOX_STATUS_URL } as NodeJS.ProcessEnv);
  assert.ok(prodOnTest.problems.some((p) => p.includes("тестовия gateway")));
});

test("settings: a 1024-bit key is refused; a certificate that does not match the key is caught", () => {
  const weak = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const base = { UPC_MERCHANT_ID: "1731096", UPC_TERMINAL_ID: "E7059096" } as unknown as NodeJS.ProcessEnv;
  assert.ok(getUpcSettings("sandbox", { ...base, UPC_PRIVATE_KEY: weak }).problems.some((p) => p.includes("2048")));
  const a = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const b = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const mismatch = getUpcSettings("sandbox", {
    ...base,
    UPC_PRIVATE_KEY: a.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    UPC_MERCHANT_CERT: b.publicKey.export({ type: "spki", format: "pem" }).toString(),
  });
  assert.ok(mismatch.problems.some((p) => p.includes("не съответства")));
});

test("config: the sandbox runs on the live site only for staff; a guest is never offered the card", async () => {
  const c = getEffectivePaymentConfig();
  assert.equal(c.enabled, true, c.problems.join(" | "));
  assert.equal(c.audience, "staff");
  assert.equal(c.isTest, true);
  assert.equal((await resolveCheckoutPayment(null)).available, false);
  assert.equal((await resolveCheckoutPayment("CUSTOMER")).available, false);
  const staff = await resolveCheckoutPayment("STAFF");
  assert.equal(staff.available, true);
  assert.equal(staff.sandbox, true);
  const guest = await placeOrder(
    { contact: CONTACT, itemsJson: STANDARD_ITEMS, paymentMethod: "card_online", checkoutKey: key(), userId: null, consents: ALL_CONSENTS },
    deps
  );
  assert.deepEqual(guest, { ok: false, error: "CARD_UNAVAILABLE" });

  const without = getEffectivePaymentConfig({ ...process.env, PAYMENT_SANDBOX_AUDIENCE: "" });
  assert.equal(without.enabled, false, "sandbox on APP_ENV=production needs the explicit staff audience");
  assert.deepEqual(upcPortalUrls("https://pizzapazzo.bg"), {
    success: "https://pizzapazzo.bg/api/payments/upc/success",
    failure: "https://pizzapazzo.bg/api/payments/upc/failure",
    notify: "https://pizzapazzo.bg/api/payments/upc/notify",
  });
});

// ── Flow ────────────────────────────────────────────────────────────────

test("start: server-priced amount, unique OrderID, signed form to /kbc/pay; double click = one attempt", async () => {
  const r = await staffCardOrder();
  const [a, b] = await Promise.all([
    startCardPayment({ accessToken: r.accessToken, locale: "bg" }),
    startCardPayment({ accessToken: r.accessToken, locale: "bg" }),
  ]);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(a.redirect.url, "https://ecg.test.upc.ua/kbc/pay");
  const f = a.redirect.postFields!;
  assert.equal(f.TotalAmount, String(STANDARD_TOTAL_MINOR), "the stored server total, in cents");
  assert.equal(f.Currency, "978");
  assert.equal(f.MerchantID, "1731096");
  assert.equal(f.TerminalID, "E7059096");
  assert.ok(f.OrderID.length <= 20 && f.OrderID.startsWith(`PP${r.orderNumber}-`));
  assert.equal(b.redirect.postFields!.OrderID, f.OrderID, "the double click gets the same session");
  assert.equal(await db.paymentAttempt.count({ where: { order: { orderNumber: r.orderNumber } } }), 1);
  assert.equal(verifyBase64(requestSignatureData(f as never), f.Signature, MERCHANT_PUBLIC, ["sha512"]), "sha512");
  const row = await orderRow(r.orderNumber);
  assert.equal(row.isTest, true);
  assert.equal(row.releasedToKitchenAt, null);
});

test("NOTIFY 000 (signed): approve + forwardUrl; PAID; test order kept off the kitchen; repeated NOTIFY changes nothing", async () => {
  const r = await staffCardOrder();
  const { sent } = await startAndSent(r.accessToken);
  const msg = gatewayMessage(sent);
  const first = await quiet(() => handleUpcNotify(body(msg)));
  assert.equal(first.action, "approve", first.reason);
  assert.match(first.body, /^Response\.action=approve$/m);
  assert.match(first.body, new RegExp(`^Response\\.forwardUrl=https://pizzapazzo\\.bg/api/payments/return\\?t=${r.accessToken}$`, "m"));
  assert.match(first.body, new RegExp(`^OrderID=${sent.OrderID}$`, "m"));

  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID");
  assert.equal(row.releasedToKitchenAt, null, "a bank TEST payment never reaches the kitchen");
  assert.equal(row.notificationAttempts, 0, "no restaurant e-mail");
  assert.ok(!(await getPendingOrders()).some((o) => o.orderNumber === r.orderNumber));
  assert.ok(!(await getPaymentAttention()).some((o) => o.orderNumber === r.orderNumber), "nothing for the shift to decide");
  assert.equal((await releaseHeldPaidOrder(row.id, STAFF)).ok, false, "staff cannot send it to the kitchen");
  const attempt = await latestAttempt(r.orderNumber);
  assert.equal(attempt.status, "PAID");
  assert.ok(!String(attempt.providerResponse).includes("499999"), "no PAN, not even masked");
  assert.ok(String(attempt.providerResponse).includes("630218123456"), "RRN kept for the report");

  const again = await quiet(() => handleUpcNotify(body(msg)));
  assert.equal(again.action, "approve");
  assert.equal(again.reason, "already recorded");
  const after2 = await orderRow(r.orderNumber);
  assert.equal(after2.paidAt?.getTime(), row.paidAt?.getTime());
  assert.equal(after2.notificationAttempts, 0);
});

test("NOTIFY signed with UPC's documented SHA-1 is accepted while the sandbox default allows it", async () => {
  const r = await staffCardOrder();
  const { sent } = await startAndSent(r.accessToken);
  const out = await quiet(() => handleUpcNotify(body(gatewayMessage(sent, {}, { algorithm: "sha1" }))));
  assert.equal(out.action, "approve", out.reason);
});

test("NOTIFY refused (reverse) without effect: unsigned, forged, other key, other terminal, unknown OrderID", async () => {
  const r = await staffCardOrder();
  const { sent } = await startAndSent(r.accessToken);
  const forger = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const cases: [string, UpcFields][] = [
    ["unsigned", gatewayMessage(sent, {}, { sign: false })],
    ["forged amount", { ...gatewayMessage(sent), TotalAmount: "1" }],
    ["other key", gatewayMessage(sent, {}, { signWith: forger })],
    ["other terminal", gatewayMessage(sent, { TerminalID: "E0000001" })],
    ["unknown order", gatewayMessage(sent, { OrderID: "PP999999-FFFFFFFF" })],
  ];
  for (const [name, f] of cases) {
    const out = await quiet(() => handleUpcNotify(body(f)));
    assert.equal(out.action, "reverse", name);
    assert.match(out.body, /^Response\.action=reverse$/m, name);
  }
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "AWAITING_PAYMENT");
  assert.equal((await latestAttempt(r.orderNumber)).status, "REDIRECTED", "the real attempt is untouched");
});

test("NOTIFY with a correctly signed but wrong amount or currency: reverse, attempt cancelled, never paid", async () => {
  for (const wrong of [{ TotalAmount: "2091" }, { Currency: "980" }, { Currency: "975" }, { PurchaseTime: "260101000000" }]) {
    const r = await staffCardOrder();
    const { sent } = await startAndSent(r.accessToken);
    const out = await quiet(() => handleUpcNotify(body(gatewayMessage(sent, wrong))));
    assert.equal(out.action, "reverse", JSON.stringify(wrong));
    const row = await orderRow(r.orderNumber);
    assert.notEqual(row.paymentStatus, "PAID");
    assert.equal((await latestAttempt(r.orderNumber)).status, "CANCELLED");
  }
});

test("decline (4999999999990029 → 105, …0037 → 116): recorded; retry gets a NEW OrderID; a late 000 on the old one is reversed", async () => {
  const r = await staffCardOrder();
  const { sent: first } = await startAndSent(r.accessToken);
  const declined = await quiet(() => handleUpcNotify(body(gatewayMessage(first, { TranCode: "105", ApprovalCode: "" }))));
  assert.equal(declined.action, "approve", "a decline is acknowledged");
  let row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "FAILED");
  assert.equal((await latestAttempt(r.orderNumber)).failureReason, "DECLINED_BY_ISSUER");

  const { sent: second } = await startAndSent(r.accessToken);
  assert.notEqual(second.OrderID, first.OrderID, "every payment request has its own OrderID");
  await quiet(() => handleUpcNotify(body(gatewayMessage(second, { TranCode: "116", ApprovalCode: "" }))));
  assert.equal((await latestAttempt(r.orderNumber)).failureReason, "INSUFFICIENT_FUNDS");

  const { sent: third } = await startAndSent(r.accessToken);
  const stale = await quiet(() => handleUpcNotify(body(gatewayMessage(first))));
  assert.equal(stale.action, "reverse", "money on a superseded attempt is refused at the gateway");
  row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "AWAITING_PAYMENT");
  const ok = await quiet(() => handleUpcNotify(body(gatewayMessage(third))));
  assert.equal(ok.action, "approve");
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "PAID");
  assert.equal(await db.paymentAttempt.count({ where: { order: { orderNumber: r.orderNumber }, status: "PAID" } }), 1);
});

test("a second successful payment for a paid order and a payment for a cancelled order are reversed", async () => {
  const r = await staffCardOrder();
  const { sent } = await startAndSent(r.accessToken);
  await quiet(() => handleUpcNotify(body(gatewayMessage(sent))));
  // A crafted second attempt row for the same order (as if two tabs paid).
  const order = await orderRow(r.orderNumber);
  await db.paymentAttempt.create({
    data: { orderId: order.id, reference: `PP${r.orderNumber}-DUP00001`, provider: "UPC", environment: "sandbox", amountMinor: 2090, currency: "EUR", status: "REDIRECTED", redirectUrl: "https://ecg.test.upc.ua/kbc/pay", redirectFormJson: JSON.stringify({ ...sent, OrderID: `PP${r.orderNumber}-DUP00001` }) },
  });
  const dup = await quiet(() => handleUpcNotify(body(gatewayMessage({ ...sent, OrderID: `PP${r.orderNumber}-DUP00001` }))));
  assert.equal(dup.action, "reverse");
  assert.equal(dup.reason, "order already paid");

  const c = await staffCardOrder();
  const { sent: cs } = await startAndSent(c.accessToken);
  await db.order.update({ where: { orderNumber: c.orderNumber }, data: { status: "CANCELLED" } });
  const out = await quiet(() => handleUpcNotify(body(gatewayMessage(cs))));
  assert.equal(out.action, "reverse");
  assert.notEqual((await orderRow(c.orderNumber)).paymentStatus, "PAID");
});

test("pay again while the first attempt is open: re-posted only while UPC never registered it (408); otherwise CHECKING", async () => {
  const r = await staffCardOrder();
  const { sent } = await startAndSent(r.accessToken);

  statusAnswer = `TranCode=408\nMerchantID=1731096\nTerminalID=E7059096\nOrderID=${sent.OrderID}\n`;
  const again = await startCardPayment({ accessToken: r.accessToken, locale: "bg" });
  assert.ok(again.ok && again.reused);
  if (again.ok) assert.equal(again.redirect.postFields!.Signature, sent.Signature, "the same signed request, same OrderID");
  assert.equal(statusCalls[0].url, "https://ecg.test.upc.ua/kbc/service/01");
  assert.deepEqual(Object.fromEntries(statusCalls[0].body), {
    MerchantID: "1731096",
    TerminalID: "E7059096",
    OrderID: sent.OrderID,
    Currency: "978",
    TotalAmount: "2090",
    PurchaseTime: sent.PurchaseTime,
  });

  statusAnswer = "TranCode=410\n"; // registered and not final for us
  assert.deepEqual(await quiet(() => startCardPayment({ accessToken: r.accessToken, locale: "bg" })), { ok: false, code: "CHECKING" });
  statusAnswer = new Error("timeout");
  assert.deepEqual(await quiet(() => startCardPayment({ accessToken: r.accessToken, locale: "bg" })), { ok: false, code: "CHECKING" });
  statusAnswer = "TranCode=601\n"; // the customer closed the page
  const fresh = await quiet(() => startCardPayment({ accessToken: r.accessToken, locale: "bg" }));
  assert.ok(fresh.ok && !fresh.reused);
  if (fresh.ok) assert.notEqual(fresh.redirect.postFields!.OrderID, sent.OrderID);
});

test("closed browser, NOTIFY never arrived: reconciliation's status query (000) settles it — still off the kitchen", async () => {
  const r = await staffCardOrder();
  await startAndSent(r.accessToken);
  await db.paymentAttempt.updateMany({
    where: { order: { orderNumber: r.orderNumber } },
    data: { createdAt: new Date(Date.now() - 5 * 60_000) },
  });
  statusAnswer = "TranCode=000\nApprovalCode=654321\nXID=X9\nRrn=630218000001\n";
  const summary = await quiet(() => reconcileOpenPayments({ limit: 50 }));
  assert.ok(summary.settled >= 1);
  const row = await orderRow(r.orderNumber);
  assert.equal(row.paymentStatus, "PAID");
  assert.equal(row.releasedToKitchenAt, null);
});

test("delayed NOTIFY after our session timeout: the same session is honoured (approve), not a second charge", async () => {
  const r = await staffCardOrder();
  const { sent } = await startAndSent(r.accessToken);
  const attempt = await latestAttempt(r.orderNumber);
  await db.paymentAttempt.update({ where: { id: attempt.id }, data: { createdAt: new Date(Date.now() - 30 * 60_000) } });
  statusAnswer = "TranCode=408\n";
  const synced = await quiet(() => syncAttempt(attempt.id));
  assert.equal(synced?.status, "EXPIRED");
  assert.equal(synced?.failureReason, "SESSION_TIMEOUT");
  const out = await quiet(() => handleUpcNotify(body(gatewayMessage(sent))));
  assert.equal(out.action, "approve", out.reason);
  assert.equal((await orderRow(r.orderNumber)).paymentStatus, "PAID");
});

test("browser return: a signed SUCCESS return only triggers a status query; unsigned goes to the neutral page", async () => {
  const r = await staffCardOrder();
  const { sent } = await startAndSent(r.accessToken);
  statusAnswer = "TranCode=408\n"; // the gateway has not confirmed anything
  const signed = await quiet(() => resolveUpcBrowserReturn("success", body(gatewayMessage(sent))));
  assert.equal(signed.verified, true);
  assert.equal(signed.path, `/payment/return?t=${r.accessToken}`);
  assert.equal(statusCalls.length, 1, "asked the gateway");
  assert.notEqual((await orderRow(r.orderNumber)).paymentStatus, "PAID", "a success page proves nothing by itself");

  const unsigned = await quiet(() => resolveUpcBrowserReturn("success", body(gatewayMessage(sent, {}, { sign: false }))));
  assert.deepEqual(unsigned, { path: "/payment/return", verified: false });

  // FAILURE_URL may use UPC's separate failure string.
  const fail: UpcFields = { ...gatewayMessage(sent, { TranCode: "105" }, { sign: false }) };
  fail.Signature = signBase64(failureSignatureData(fail), GATEWAY_KEY, "sha512");
  const failed = await quiet(() => resolveUpcBrowserReturn("failure", body(fail)));
  assert.equal(failed.verified, true);
});
