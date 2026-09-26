/**
 * End-to-end check of the card-payment flow against a RUNNING server with
 * the payment simulator — real HTTP requests to the real pages and API.
 *
 * Two steps are played from here instead of a browser:
 *   - placing the order (the checkout form is a React server action), done
 *     with the same placeOrder() the action calls, on the same database;
 *   - the tester's click on the simulator page, done with the same
 *     recordSimulatorOutcome() the page calls, followed by the signed
 *     callback the simulator sends.
 * Everything else — review page, /api/payments/start, the redirect to the
 * hosted page, return URL, status polling, success/failed pages, the kitchen
 * API — goes over HTTP.
 *
 * Needs the server and this script to share the database and the simulator
 * secret, so it is for a local dev server (or a Render shell on staging).
 * It deletes everything it created at the end.
 *
 *   npm run dev   (with the simulator env, see docs/online-card-payments.md)
 *   npm run e2e:payments
 *
 * NOT a bank test.
 */
import { db } from "@/lib/db";
import { placeOrder } from "@/lib/checkout/place-order";
import { recordSimulatorOutcome, signSimulatorBody, SIMULATOR_SIGNATURE_HEADER } from "@/lib/payments/providers/simulator";
import { signSession, SESSION_COOKIE } from "@/lib/auth/jwt";
import { getAppEnv } from "@/lib/app-env";
import type { Product } from "@/types/product";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.PAYMENT_SIMULATOR_SECRET ?? "";

if (getAppEnv() === "production") {
  console.error("Refusing to run against APP_ENV=production.");
  process.exit(1);
}

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function getProduct(id: string, locale: "bg" | "en"): Promise<Product | null> {
  const p = await db.menuProduct.findUnique({ where: { id }, include: { variants: true } });
  if (!p) return null;
  return {
    id: p.id,
    name: locale === "en" ? p.nameEn : p.nameBg,
    slug: p.slug,
    description: "",
    categoryId: p.categoryId,
    priceEur: Number(p.priceEur),
    imageUrl: p.imageUrl ?? "",
    allergens: [],
    isAvailable: p.isAvailable,
    sortOrder: p.sortOrder,
    variants: p.variants.map((v) => ({ id: v.id, name: locale === "en" ? v.nameEn : v.nameBg, priceEur: Number(v.priceEur) })),
  };
}

const manual = { redirect: "manual" as const };

async function start(token: string, locale = "bg") {
  const body = new URLSearchParams({ token, locale });
  const res = await fetch(`${BASE}/api/payments/start`, { method: "POST", body, ...manual });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

async function status(token: string): Promise<string> {
  const res = await fetch(`${BASE}/api/payments/status?t=${token}`);
  return ((await res.json()) as { state: string }).state;
}

async function callback(reference: string, providerPaymentId: string, secret = SECRET) {
  const body = JSON.stringify({ reference, providerPaymentId });
  const res = await fetch(`${BASE}/api/payments/callback/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [SIMULATOR_SIGNATURE_HEADER]: signSimulatorBody(body, secret) },
    body,
  });
  return res.status;
}

async function main() {
  const createdOrders: string[] = [];
  const staff = await db.user.findFirst({ where: { role: { in: ["STAFF", "ADMIN", "SUPER_ADMIN"] }, isActive: true } });
  if (!staff) throw new Error("No staff user in this database to read the kitchen board as.");
  const cookie = `${SESSION_COOKIE}=${await signSession({ sub: staff.id, email: staff.email, role: staff.role as "STAFF" })}`;
  const kitchen = async () => {
    const res = await fetch(`${BASE}/api/admin/pending-orders`, { headers: { cookie } });
    return ((await res.json()) as { orders: { orderNumber: number; paymentStatus: string }[] }).orders;
  };

  const pizza = await db.menuProduct.findFirst({
    where: { isAvailable: true, variants: { some: {} }, categoryId: { in: ["cat_pizzas_standard", "cat_pizzas_special"] } },
    include: { variants: true },
  });
  if (!pizza) throw new Error("No pizza in the menu.");
  const items = JSON.stringify([{ productId: pizza.id, variantId: pizza.variants[0].id, quantity: 2 }]);
  const contact = {
    customerName: "E2E Тест",
    customerEmail: "e2e@example.test",
    customerPhone: "0888000000",
    deliveryCity: "Плевен",
    deliveryAddress: "ул. Тестова 1",
    deliveryNote: "",
  };

  try {
    console.log(`E2E card payment against ${BASE}\n`);

    // ── 1. Card order ──
    const placed = await placeOrder(
      { contact, itemsJson: items, paymentMethod: "card_online", checkoutKey: crypto.randomUUID(), userId: null },
      { getProduct }
    );
    if (!placed.ok || !placed.accessToken) throw new Error(`placeOrder: ${JSON.stringify(placed)}`);
    const token = placed.accessToken;
    const order = await db.order.findUniqueOrThrow({ where: { accessToken: token } });
    createdOrders.push(order.id);
    const expectedMinor = Math.round(Number(order.totalEur) * 100);
    console.log(`order #${order.orderNumber}, total ${Number(order.totalEur).toFixed(2)} €`);

    let res = await fetch(`${BASE}/checkout/pay/${token}`);
    const reviewHtml = await res.text();
    check(res.status === 200, "review page renders");
    check(reviewHtml.includes(`Поръчка №${order.orderNumber}`), "review page shows the order number");
    check(reviewHtml.includes("/api/payments/start"), "review page posts to /api/payments/start");
    check(!/name="(cardNumber|cvv|cvc|pan)"/i.test(reviewHtml), "no card field anywhere on our page");

    res = await fetch(`${BASE}/payment/success?t=${token}`, manual);
    check(
      res.status >= 300 && res.status < 400 && (res.headers.get("location") ?? "").includes("/payment/return"),
      "success URL of an UNPAID order redirects to the checking page",
      `${res.status} ${res.headers.get("location")}`
    );
    check((await kitchen()).every((o) => o.orderNumber !== order.orderNumber), "unpaid card order is NOT on the kitchen board");

    // ── 2. Pay: double click ──
    const [s1, s2, s3] = await Promise.all([start(token), start(token), start(token)]);
    check(s1.status === 303 && s1.location.includes("/payment-simulator/"), "start → 303 to the hosted page", `${s1.status} ${s1.location}`);
    check(s1.location === s2.location && s2.location === s3.location, "three concurrent clicks → one hosted session");
    check((await db.paymentAttempt.count({ where: { orderId: order.id } })) === 1, "exactly one payment attempt");
    res = await fetch(s1.location);
    const simHtml = await res.text();
    check(res.status === 200 && simHtml.includes("Тестов симулатор — без реални пари"), "simulator hosted page renders with its warning");
    const cardInput = /<input[^>]*data-testid="sim-card-number"[^>]*>/.exec(simHtml)?.[0] ?? "";
    check(cardInput !== "" && !/\sname=/.test(cardInput), "the card-number field has no name (it can never be submitted)");
    check(simHtml.includes('name="scenario"') && simHtml.includes('name="sessionId"'), "the only form fields sent to the server are sessionId + scenario");
    const a1 = await db.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
    check(a1.amountMinor === expectedMinor, "amount sent = stored total in cents", `${a1.amountMinor} vs ${expectedMinor}`);

    // ── 3. Declined ──
    await recordSimulatorOutcome(a1.providerPaymentId!, "declined");
    check((await callback(a1.reference, a1.providerPaymentId!)) === 200, "signed callback accepted");
    res = await fetch(`${BASE}/api/payments/return?t=${token}&success=true`, manual);
    check(res.status === 303 && (res.headers.get("location") ?? "").includes(`/payment/return?t=${token}`), "return URL → checking page (its ?success=true ignored)");
    check((await status(token)) === "FAILED", "status API: FAILED");
    res = await fetch(`${BASE}/payment/failed?t=${token}`, manual);
    check(res.status === 200, "failed page renders");
    check((await kitchen()).every((o) => o.orderNumber !== order.orderNumber), "declined order is NOT on the kitchen board");
    check((await callback(a1.reference, a1.providerPaymentId!, "wrong-secret-xxxxxxxxxxxx")) === 401, "forged callback → 401");

    // ── 4. Retry → paid, duplicate callbacks ──
    const retry = await start(token);
    check(retry.status === 303 && retry.location !== s1.location, "retry opens a NEW hosted session for the SAME order");
    const a2 = await db.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
    await recordSimulatorOutcome(a2.providerPaymentId!, "paid");
    const codes = await Promise.all([1, 2, 3].map(() => callback(a2.reference, a2.providerPaymentId!)));
    check(codes.every((c) => c === 200), "three duplicate callbacks acknowledged");
    check((await status(token)) === "PAID", "status API: PAID");
    res = await fetch(`${BASE}/payment/success?t=${token}`, manual);
    check(res.status === 200, "success page renders for the paid order");
    const onBoard = (await kitchen()).filter((o) => o.orderNumber === order.orderNumber);
    check(onBoard.length === 1 && onBoard[0].paymentStatus === "PAID", "paid order is on the kitchen board exactly once");
    const paidRow = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    check(
      paidRow.isTest && paidRow.notificationAttempts === 1 && paidRow.notificationStatus === "SKIPPED" && !paidRow.notificationSentAt,
      "one notification decision, SKIPPED (test orders never reach the inbox); order flagged TEST"
    );
    check((await db.order.count({ where: { customerEmail: "e2e@example.test", id: { notIn: createdOrders } } })) === 0, "no second order was created");

    const again = await start(token);
    check(again.location.includes("/payment/success"), "'Pay' on a paid order → success page, no new session");
    res = await fetch(`${BASE}/en/checkout/pay/${token}`, manual);
    check((res.headers.get("location") ?? "").includes("/en/payment/success"), "English review page of a paid order → English success page");

    // ── 5. Cash still works as before ──
    const cash = await placeOrder(
      { contact, itemsJson: items, paymentMethod: "cash_on_delivery", checkoutKey: crypto.randomUUID(), userId: null },
      { getProduct }
    );
    if (!cash.ok) throw new Error("cash order failed");
    createdOrders.push((await db.order.findUniqueOrThrow({ where: { orderNumber: cash.orderNumber } })).id);
    check((await kitchen()).some((o) => o.orderNumber === cash.orderNumber && o.paymentStatus === "CASH_DUE"), "cash order goes straight to the kitchen");
  } finally {
    const refs = await db.paymentAttempt.findMany({ where: { orderId: { in: createdOrders } }, select: { reference: true } });
    await db.paymentSimulatorSession.deleteMany({ where: { reference: { in: refs.map((r) => r.reference) } } });
    await db.order.deleteMany({ where: { id: { in: createdOrders } } });
    console.log(`\ncleaned up ${createdOrders.length} test orders`);
    await db.$disconnect();
  }

  console.log(failures === 0 ? "\nE2E OK" : `\nE2E FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
