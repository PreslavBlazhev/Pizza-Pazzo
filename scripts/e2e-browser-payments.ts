/**
 * BROWSER end-to-end test of the card flow with the payment simulator: a real
 * Chrome (the one installed on this machine, driven by playwright-core — no
 * browser is downloaded) clicks through product → cart → checkout → review →
 * simulator card form → result pages, on a phone-sized screen.
 *
 * What it proves, besides the pages working:
 *   - the card digits typed on the simulator page never leave the browser
 *     (every request URL and body is recorded and searched);
 *   - one order per checkout, PAID only after verification, kitchen once,
 *     "ТЕСТ — НЕ ПРИГОТВЯЙ" + "НЕ СЪБИРАЙ ПАРИ" in the admin and on the ticket;
 *   - decline keeps the cart and retries the SAME order; 3-D Secure (simulated),
 *     pending, cancel and late confirmation behave.
 *
 * Needs a running server with the simulator and the same database:
 *   npm run dev   (simulator env — docs/online-card-payments.md)
 *   npm run e2e:browser            (E2E_HEADED=1 to watch it)
 * Deletes the orders it created. NOT a bank test.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE } from "@/lib/auth/jwt";
import { getAppEnv } from "@/lib/app-env";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = process.env.E2E_SHOTS ?? path.join(process.env.TEMP ?? ".", "pp-e2e-shots");
const CARD_DIGITS = ["4242424242424242", "4000000000009995", "4000002760003184", "4000000000000077", "4111111111111111"];

if (getAppEnv() === "production") {
  console.error("Refusing to run against APP_ENV=production.");
  process.exit(1);
}

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const traffic: string[] = [];
const created = new Set<string>();

async function newCustomer(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "bg-BG" });
  const page = await ctx.newPage();
  page.on("request", (r) => traffic.push(`${r.method()} ${r.url()} ${r.postData() ?? ""}`));
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function cartCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("pp-cart");
      return raw ? (JSON.parse(raw).state?.items?.length ?? 0) : 0;
    } catch {
      return -1;
    }
  });
}

/** Product → cart → checkout (card) → review page. Returns the order token. */
async function checkoutByCard(page: Page, slug: string, tag: string): Promise<string> {
  await page.goto(`${BASE}/product/${slug}`);
  await page.getByRole("button", { name: "Добави в количката" }).first().click();
  await page.waitForFunction(() => (localStorage.getItem("pp-cart") ?? "").includes("items"));
  await page.goto(`${BASE}/checkout`);
  await page.locator('[name="customerName"]').fill("Браузър Тест");
  await page.locator('[name="customerPhone"]').fill("0888111222");
  await page.locator('[name="customerEmail"]').fill("browser-e2e@example.test");
  await page.locator('[name="deliveryAddress"]').fill(`ул. Тестова 5 (${tag})`);
  await page.getByText("Плащане онлайн с карта").click();
  // The three explicit confirmations (UBB-16) start unticked.
  for (const name of ["consentTerms", "consentRefunds", "consentPrivacy"]) {
    await page.locator(`input[name="${name}"]`).check();
  }
  await shot(page, `${tag}-01-checkout`);
  await page.getByRole("button", { name: "Поръчай и плати с карта" }).click();
  await page.waitForURL(/\/checkout\/pay\//, { timeout: 30_000 });
  const token = page.url().split("/checkout/pay/")[1].split("?")[0];
  const order = await db.order.findUniqueOrThrow({ where: { accessToken: token } });
  created.add(order.id);
  return token;
}

/** Review → "Плати с карта" → simulator → type a card → Pay. */
async function payWithCard(page: Page, number: string, tag: string) {
  await page.getByRole("button", { name: /Плати с карта/ }).click();
  await page.waitForURL(/\/payment-simulator\//, { timeout: 30_000 });
  await page.getByTestId("sim-card-number").fill(number);
  await page.getByTestId("sim-card-expiry").fill("12/29");
  await page.getByTestId("sim-card-cvc").fill("123");
  await shot(page, `${tag}-03-simulator-form`);
  await page.getByTestId("sim-pay").click();
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const pizza = await db.menuProduct.findFirstOrThrow({
    where: { isAvailable: true, categoryId: "cat_pizzas_standard", variants: { some: {} } },
  });
  const staff = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", isActive: true } });
  const staffCookie = await signSession({ sub: staff.id, email: staff.email, role: "SUPER_ADMIN" });

  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  try {
    // ── A. 4242 4242 4242 4242 → paid ─────────────────────────────────────
    console.log("A. successful test card");
    {
      const { ctx, page } = await newCustomer(browser);
      const token = await checkoutByCard(page, pizza.slug, "A");
      const order = await db.order.findUniqueOrThrow({ where: { accessToken: token }, include: { items: true } });
      check(order.paymentStatus === "AWAITING_PAYMENT" && !order.releasedToKitchenAt, "checkout created the order unpaid, not in the kitchen");
      check((await db.order.count({ where: { checkoutKey: order.checkoutKey } })) === 1, "exactly one order for this checkout");

      const reviewText = await page.locator("main").innerText();
      const totalLabel = `${Number(order.totalEur).toFixed(2)} €`;
      check(reviewText.includes(`Поръчка №${order.orderNumber}`), "review shows the order number");
      check(reviewText.includes(order.items[0].productNameBg), "review shows the product from the server");
      check(reviewText.includes(totalLabel), `review shows the server total (${totalLabel})`);
      await shot(page, "A-02-review");

      // A real-looking card is refused and wiped.
      await page.getByRole("button", { name: /Плати с карта/ }).click();
      await page.waitForURL(/\/payment-simulator\//, { timeout: 30_000 });
      check((await page.getByTestId("sim-amount").innerText()).includes(totalLabel), "simulator shows the same amount");
      await page.getByTestId("sim-card-number").fill("4111 1111 1111 1111");
      await page.getByTestId("sim-card-expiry").fill("12/29");
      await page.getByTestId("sim-card-cvc").fill("123");
      await page.getByTestId("sim-pay").click();
      check((await page.getByTestId("sim-error").innerText()).includes("истинска карта"), "a real-looking card number is refused");
      check((await page.getByTestId("sim-card-number").inputValue()) === "", "…and cleared from the field");
      await shot(page, "A-03b-real-card-refused");

      await page.getByTestId("sim-card-number").fill("4242 4242 4242 4242");
      await page.getByTestId("sim-pay").click();
      await page.getByTestId("sim-processing").waitFor();
      check((await page.getByTestId("sim-processing").innerText()).includes("Обработваме плащането"), "'Обработваме плащането…' is shown");
      await shot(page, "A-04-processing");
      await page.waitForURL(/\/payment\/success/, { timeout: 60_000 });
      await page.getByText("Плащането е успешно").waitFor();
      const successText = await page.locator("main").innerText();
      check(successText.includes(`Поръчка №${order.orderNumber}`) && successText.includes(totalLabel), "thank-you page: right number and amount");
      await shot(page, "A-05-success");
      await page.waitForTimeout(500);
      check((await cartCount(page)) === 0, "cart emptied only after the confirmed payment");

      const paid = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { paymentAttempts: true } });
      check(paid.paymentStatus === "PAID" && !!paid.releasedToKitchenAt, "order PAID and released to the kitchen");
      check(paid.paymentAttempts.length === 1 && paid.paymentAttempts[0].status === "PAID", "one attempt, PAID");
      const sim = await db.paymentSimulatorSession.findUniqueOrThrow({ where: { id: paid.paymentAttempts[0].providerPaymentId! } });
      check(sim.state === "PAID", "simulator ledger recorded PAID (the 'bank' side)");
      check(paid.isTest && paid.notificationStatus === "SKIPPED" && paid.notificationAttempts === 1, "TEST order; restaurant e-mail deliberately not sent, decided once");

      // Refresh, back, forward — nothing new.
      await page.reload();
      await page.goBack();
      await page.goBack();
      await page.goto(`${BASE}/payment/success?t=${token}`);
      const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { paymentAttempts: true } });
      check(after.paymentAttempts.length === 1 && after.releasedToKitchenAt?.getTime() === paid.releasedToKitchenAt?.getTime(), "refresh/back: no second payment, no second release");
      check((await db.order.count({ where: { customerEmail: "browser-e2e@example.test", id: { notIn: [...created] } } })) === 0, "no second order");

      // Staff side, in the browser with a staff session.
      await ctx.addCookies([{ name: SESSION_COOKIE, value: staffCookie, url: BASE }]);
      const board = await (await ctx.request.get(`${BASE}/api/admin/pending-orders`)).json();
      check(board.orders.filter((o: { id: string }) => o.id === order.id).length === 1, "on the staging kitchen board exactly once");
      await page.goto(`${BASE}/admin/orders/${order.id}`);
      const adminText = await page.locator("body").innerText();
      check(adminText.includes("ТЕСТ"), "admin shows the TEST marker");
      check(adminText.includes("ПЛАТЕНО ОНЛАЙН С КАРТА — НЕ СЪБИРАЙ ПАРИ"), "admin shows 'ПЛАТЕНО ОНЛАЙН С КАРТА — НЕ СЪБИРАЙ ПАРИ'");
      await shot(page, "A-06-admin");
      await page.goto(`${BASE}/admin/orders/${order.id}/print?t=kitchen`);
      const kitchenTicket = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      check(kitchenTicket.includes("ТЕСТ — НЕ ПРИГОТВЯЙ"), "kitchen ticket: 'ТЕСТ — НЕ ПРИГОТВЯЙ' (even though it hides payment)");
      await shot(page, "A-07-ticket-kitchen");
      await page.goto(`${BASE}/admin/orders/${order.id}/print?t=delivery`);
      const deliveryTicket = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      check(
        deliveryTicket.includes("ТЕСТ — НЕ ПРИГОТВЯЙ") &&
          deliveryTicket.includes("ПЛАТЕНО ОНЛАЙН С КАРТА — НЕ СЪБИРАЙ ПАРИ"),
        "delivery ticket: 'ТЕСТ' + 'ПЛАТЕНО ОНЛАЙН С КАРТА — НЕ СЪБИРАЙ ПАРИ'"
      );
      await shot(page, "A-08-ticket-delivery");
      await page.goto(`${BASE}/admin/orders/live`);
      await ctx.close();
    }

    // ── B. 4000 0000 0000 9995 → declined → retry the SAME order (3-D Secure) ─
    console.log("B. declined test card, then retry with simulated 3-D Secure");
    {
      const { ctx, page } = await newCustomer(browser);
      const token = await checkoutByCard(page, pizza.slug, "B");
      const order = await db.order.findUniqueOrThrow({ where: { accessToken: token } });
      await payWithCard(page, "4000 0000 0000 9995", "B");
      await page.waitForURL(/\/payment\/failed/, { timeout: 60_000 });
      const failedText = await page.locator("main").innerText();
      check(failedText.includes("Плащането не беше извършено") && failedText.includes("Банката отказа"), "failure page with the decline reason");
      await shot(page, "B-05-failed");
      check((await cartCount(page)) > 0, "cart kept after the decline");
      const declined = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      check(declined.paymentStatus === "FAILED" && !declined.releasedToKitchenAt, "declined order FAILED and not in the kitchen");

      await page.getByRole("link", { name: "Опитай отново с карта" }).click();
      await page.waitForURL(new RegExp(`/checkout/pay/${token}`));
      await payWithCard(page, "4000 0027 6000 3184", "B-retry");
      await page.getByTestId("sim-3ds").waitFor({ timeout: 10_000 });
      check((await page.getByTestId("sim-3ds").innerText()).includes("СИМУЛАЦИЯ"), "3-D Secure step is clearly a simulation");
      await shot(page, "B-06-3ds");
      await page.getByTestId("sim-3ds-confirm").click();
      await page.waitForURL(/\/payment\/success/, { timeout: 60_000 });
      const retried = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { paymentAttempts: true } });
      check(retried.paymentStatus === "PAID" && retried.paymentAttempts.length === 2, "retry paid the SAME order (2 attempts, 1 order)");
      await ctx.close();
    }

    // ── C. pending card, D. cancel on the 'bank' page, E. late confirmation ─
    console.log("C/D/E. pending, cancel, late confirmation");
    {
      const { ctx, page } = await newCustomer(browser);
      const token = await checkoutByCard(page, pizza.slug, "C");
      await payWithCard(page, "4000 0000 0000 0077", "C");
      await page.waitForURL(/\/payment\/pending/, { timeout: 60_000 });
      check((await page.locator("main").innerText()).includes("Чакаме потвърждение"), "pending card → 'Чакаме потвърждение'");
      await shot(page, "C-05-pending");
      const pending = await db.order.findUniqueOrThrow({ where: { accessToken: token } });
      check(!pending.releasedToKitchenAt, "pending order not in the kitchen");
      await ctx.close();
    }
    {
      const { ctx, page } = await newCustomer(browser);
      await checkoutByCard(page, pizza.slug, "D");
      await page.getByRole("button", { name: /Плати с карта/ }).click();
      await page.waitForURL(/\/payment-simulator\//);
      await page.getByRole("button", { name: /Отказ — връщане в Pizza Pazzo/ }).click();
      await page.waitForURL(/\/payment\/failed/, { timeout: 60_000 });
      check((await page.locator("main").innerText()).includes("прекъснато"), "cancel on the hosted page → 'Плащането беше прекъснато'");
      await ctx.close();
    }
    {
      const { ctx, page } = await newCustomer(browser);
      const token = await checkoutByCard(page, pizza.slug, "E");
      await page.getByRole("button", { name: /Плати с карта/ }).click();
      await page.waitForURL(/\/payment-simulator\//);
      await page.locator("details summary").click();
      await page.getByRole("button", { name: /потвърдено като платено след 20 секунди/ }).click();
      await page.waitForURL(/\/payment\/pending/, { timeout: 60_000 });
      await page.waitForURL(/\/payment\/success/, { timeout: 90_000 }); // the page polls on its own
      const late = await db.order.findUniqueOrThrow({ where: { accessToken: token } });
      check(late.paymentStatus === "PAID" && !!late.releasedToKitchenAt, "late confirmation: the pending page moved to 'paid' by itself");
      await ctx.close();
    }

    // ── Card data never left the browser ───────────────────────────────────
    const leaked = traffic.filter((t) => CARD_DIGITS.some((d) => t.replace(/[\s%20+-]/g, "").includes(d)));
    check(leaked.length === 0, `no request carried card digits (${traffic.length} requests inspected)`, leaked.slice(0, 2).join(" | "));
  } finally {
    await browser.close();
    const refs = await db.paymentAttempt.findMany({ where: { orderId: { in: [...created] } }, select: { reference: true } });
    await db.paymentSimulatorSession.deleteMany({ where: { reference: { in: refs.map((r) => r.reference) } } });
    await db.order.deleteMany({ where: { id: { in: [...created] } } });
    console.log(`\ncleaned up ${created.size} test orders; screenshots in ${SHOTS}`);
    await db.$disconnect();
  }
  console.log(failures === 0 ? "\nBROWSER E2E OK" : `\nBROWSER E2E FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
