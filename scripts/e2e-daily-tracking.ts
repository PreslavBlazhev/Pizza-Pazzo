/**
 * Browser check of the 2026-10-17 changes against a RUNNING production build
 * (`next build && next start`) on a COPY of the dev database:
 *
 *   - checkout → success page → tracking link; the HttpOnly tracking cookie;
 *     nothing about the order in localStorage / sessionStorage;
 *   - two current orders: the home page card and /track (phone width);
 *   - the kitchen: accept, then every next step from "В процес"; a stale
 *     second screen gets a conflict; the e-mail status line;
 *   - the customer sees each recorded status (poll + reload), no timer;
 *   - the e-mail link on another device (token in the fragment), a forged
 *     token, losing and regaining the connection;
 *   - 22:30: the orders' clock is moved past the cutoff in the database (what
 *     the filter sees at 22:30), and the open customer page, the home card
 *     and the kitchen board all empty themselves; printing answers 410;
 *     the maintenance endpoint then deletes everything.
 *
 *   E2E_BASE_URL=http://localhost:3020 MAINTENANCE_SECRET=… AUTH_SECRET=… \
 *   DATABASE_URL=file:./dev.db npx tsx scripts/e2e-daily-tracking.ts [outDir]
 *
 * Screenshots go to outDir (default docs/evidence-2026-10-17). Synthetic data
 * only; nothing is e-mailed (run the server without RESEND_API_KEY).
 */
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3020").replace(/\/$/, "");
const OUT = process.argv[2] ?? "docs/evidence-2026-10-17";
const SECRET = process.env.AUTH_SECRET ?? "";
const prisma = new PrismaClient();
mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tokenFor = (orderId: string) =>
  `${orderId}.${createHmac("sha256", SECRET).update(`pp-track:v1:${orderId}`).digest("base64url")}`;

async function staffContext(browser: Browser, viewport = { width: 1280, height: 900 }): Promise<BrowserContext> {
  let admin = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  admin ??= await prisma.user.create({
    data: { email: "e2e-admin@example.test", passwordHash: "x", fullName: "E2E Admin", role: "ADMIN" },
  });
  const jwt = await new SignJWT({ email: admin.email, role: admin.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: "pp_session", value: jwt, url: BASE }]);
  return ctx;
}

async function placeOrder(page: Page, tag: string): Promise<number> {
  await page.goto(`${BASE}/product/moyata-patso`);
  await page.getByRole("button", { name: "Добави в количката" }).first().click();
  await page.waitForFunction(() => (localStorage.getItem("pp-cart") ?? "").includes("prod_moyata_patso"));
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("pp-cart")!);
    c.state.items[0].quantity = 2;
    localStorage.setItem("pp-cart", JSON.stringify(c));
  });
  await page.goto(`${BASE}/checkout`);
  await page.locator('[name="customerName"]').waitFor();
  await page.locator('[name="customerName"]').fill(`Тест Проследяване ${tag}`);
  await page.locator('[name="customerPhone"]').fill("0888111222");
  await page.locator('[name="customerEmail"]').fill("tracking-e2e@example.test");
  await page.locator('[name="deliveryAddress"]').fill(`ул. Тестова 7 (${tag})`);
  for (const name of ["consentTerms", "consentRefunds", "consentPrivacy"]) {
    await page.locator(`input[name="${name}"]`).check();
  }
  await page.locator('[data-testid="place-order"]').click();
  await page.waitForURL(/order-success/, { timeout: 30_000 });
  const n = Number(/#(\d+)/.exec(await page.locator("main").innerText())?.[1]);
  return n;
}

async function stepText(page: Page, orderNumber: number) {
  const card = page.locator(`[data-testid="track-order-${orderNumber}"]`);
  return card.locator('[data-state="active"]').innerText().catch(() => "");
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const customer = await phone.newPage();
  const errors: string[] = [];
  customer.on("pageerror", (e) => errors.push(e.message));
  try {
    console.log("1. Two orders from one phone; the success page and the cookie");
    const n1 = await placeOrder(customer, "A");
    check(n1 > 0, `order #${n1} placed`);
    check(await customer.locator('[data-testid="track-link"]').isVisible(), "success page links to tracking");
    await shot(customer, "01-success-mobile");
    const n2 = await placeOrder(customer, "B");
    check(n2 === n1 + 1, `second order #${n2}`);
    const cookies = await phone.cookies(BASE);
    const track = cookies.find((c) => c.name === "pp_track");
    check(!!track && track.httpOnly, "tracking cookie is HttpOnly");
    check(!!track && track.value.split("~").length === 2, "the cookie holds both orders");
    check(!!track && track.expires > Date.now() / 1000 && track.expires < Date.now() / 1000 + 24 * 3600, "it expires within a day (at 22:30)");
    const storage = await customer.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    check(!storage.includes(track?.value.split("~")[0] ?? "§"), "no tracking token in browser storage");
    check(!/Тест Проследяване|ул\. Тестова 7/.test(storage), "no order details in browser storage after checkout");

    const rows = await prisma.order.findMany({ where: { orderNumber: { in: [n1, n2] } }, orderBy: { orderNumber: "asc" } });
    const [o1, o2] = rows;

    console.log("2. Home card and /track at phone width");
    await customer.goto(`${BASE}/`);
    const card = customer.locator('[data-testid="track-card"]');
    await card.waitFor({ timeout: 15_000 });
    const cardText = await card.innerText();
    check(cardText.includes(`#${n1}`) && cardText.includes(`#${n2}`), "the card lists both current orders", cardText);
    check(cardText.includes("Изпратена — очаква потвърждение"), "with their real status");
    await card.scrollIntoViewIfNeeded();
    await shot(customer, "02-home-card-mobile");
    const width = await customer.evaluate(() => document.documentElement.scrollWidth);
    check(width <= 390, "no horizontal scroll on the phone", String(width));
    await card.click();
    await customer.waitForURL(/\/track/);
    await customer.locator(`[data-testid="track-order-${n1}"]`).waitFor();
    check((await stepText(customer, n1)).includes("Изпратена"), "step 1 active");
    check((await customer.locator(`[data-testid="track-order-${n1}"] [data-step]`).count()) === 5, "a delivery shows five steps");
    check(await customer.locator('[data-testid="track-updated"]').isVisible(), "shows the time of the last update");
    await shot(customer, "03-track-two-orders-mobile");

    console.log("3. The kitchen: accept and walk the order through");
    const staff = await staffContext(browser);
    const board = await staff.newPage();
    await board.goto(`${BASE}/admin/orders/live`);
    await board.getByRole("button", { name: /Начало на смяната/ }).click();
    await board.getByText(`#${n1}`).first().waitFor({ timeout: 20_000 });
    const acceptButtons = board.getByRole("button", { name: /ПРИЕМИ/ });
    await acceptButtons.first().click();
    const active = board.locator(`[data-testid="active-order-${n1}"]`);
    await active.waitFor({ timeout: 20_000 });
    check((await active.innerText()).includes("Прието"), "accepted order is in 'В процес'");
    check((await active.locator('[data-testid="email-status"]').innerText()).startsWith("Имейл:"), "its e-mail status is a separate line");
    await shot(board, "04-kitchen-in-progress-desktop");

    // A second, stale screen (opened now, never refreshed) for the conflict check.
    const tablet = await (await staffContext(browser, { width: 820, height: 1180 })).newPage();
    await tablet.goto(`${BASE}/admin/orders/live`);
    await tablet.getByRole("button", { name: /Начало на смяната/ }).click();
    await tablet.locator(`[data-testid="active-order-${n1}"]`).waitFor({ timeout: 20_000 });
    await shot(tablet, "05-kitchen-tablet");

    await active.locator('[data-testid="step-PREPARING"]').click();
    await board.waitForFunction((n) => document.querySelector(`[data-testid="active-order-${n}"]`)?.textContent?.includes("Приготвя се"), n1);
    // The tablet still shows "Прието" — its tap must not move the order twice.
    await tablet.locator(`[data-testid="active-order-${n1}"] [data-testid="step-PREPARING"]`).click({ timeout: 5_000 }).catch(() => undefined);
    await sleep(1500);
    const afterConflict = await prisma.order.findUniqueOrThrow({ where: { id: o1.id } });
    check(afterConflict.status === "PREPARING", "a stale screen's tap changes nothing", afterConflict.status);

    await customer.reload();
    await customer.locator(`[data-testid="track-order-${n1}"]`).waitFor();
    check((await stepText(customer, n1)).includes("Приета / Приготвя се"), "customer sees 'Приета / Приготвя се'");
    await shot(customer, "06-track-preparing-mobile");

    for (const [to, label] of [
      ["READY", "Готова — чака доставчик"],
      ["OUT_FOR_DELIVERY", "В доставка"],
    ] as const) {
      await board.locator(`[data-testid="active-order-${n1}"] [data-testid="step-${to}"]`).click();
      await board.waitForFunction(
        ([n, t]) => document.querySelector(`[data-testid="active-order-${n}"]`)?.textContent?.includes(t as string),
        [n1, label === "В доставка" ? "В доставка" : "Готова"] as const
      );
    }
    // The open customer page follows by polling (15 s), without a reload.
    await customer.waitForFunction(
      (n) => document.querySelector(`[data-testid="track-order-${n}"] [data-state="active"]`)?.textContent?.includes("В доставка"),
      n1,
      { timeout: 25_000 }
    );
    check(true, "the open page picked up 'В доставка' by itself");
    await board.locator(`[data-testid="active-order-${n1}"] [data-testid="step-DELIVERED"]`).click();
    await board.locator(`[data-testid="active-order-${n1}"]`).waitFor({ state: "detached", timeout: 20_000 });
    check(true, "a delivered order leaves 'В процес'");
    await customer.reload();
    await customer.locator(`[data-testid="track-order-${n1}"]`).waitFor();
    check((await stepText(customer, n1)).includes("Доставена"), "customer sees 'Доставена'");
    await shot(customer, "07-track-delivered-mobile");

    console.log("4. The e-mail link on another device; a forged token");
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const otherPage = await other.newPage();
    await otherPage.goto(`${BASE}/track#t=${tokenFor(o2.id)}`);
    await otherPage.locator(`[data-testid="track-order-${n2}"]`).waitFor({ timeout: 15_000 });
    check(true, "the link opens the order without an account");
    await otherPage.waitForFunction(() => !location.hash);
    check(true, "the token is removed from the address bar");
    check((await other.cookies(BASE)).some((c) => c.name === "pp_track" && c.httpOnly), "and remembered in an HttpOnly cookie");
    const forged = await browser.newContext();
    const forgedPage = await forged.newPage();
    await forgedPage.goto(`${BASE}/track#t=${o2.id}.${"A".repeat(43)}`);
    await forgedPage.locator('[data-testid="track-empty"]').waitFor({ timeout: 15_000 });
    check((await forgedPage.innerText("main")).includes("Проследяването е изтекло"), "a forged token gets the generic message");
    const api = await forgedPage.evaluate(async (n) => {
      const r = await fetch("/api/track", { method: "POST", body: JSON.stringify({ token: String(n) }) });
      return { status: r.status, cc: r.headers.get("cache-control"), rp: r.headers.get("referrer-policy") };
    }, n2);
    check(api.status === 404, "an order NUMBER is not a credential (404)");
    check((api.cc ?? "").includes("no-store") && api.rp === "no-referrer", "no-store and no-referrer on the answer");

    console.log("5. Losing and regaining the connection");
    await customer.goto(`${BASE}/track`);
    await customer.locator(`[data-testid="track-order-${n2}"]`).waitFor();
    await phone.setOffline(true);
    await customer.waitForSelector('[data-testid="track-offline"]', { timeout: 25_000 });
    check(true, "the page says the connection is lost");
    await shot(customer, "08-track-offline-mobile");
    await phone.setOffline(false);
    await customer.evaluate(() => window.dispatchEvent(new Event("online")));
    await customer.waitForSelector('[data-testid="track-offline"]', { state: "detached", timeout: 15_000 });
    check(true, "and recovers when it is back");

    console.log("6. The kitchen ticket of a live order");
    const print = await staff.newPage();
    await print.goto(`${BASE}/admin/orders/${o2.id}/print?t=delivery`);
    await shot(print, "09-print-page-real-order");
    const printable = await board.evaluate(async (id) => (await fetch(`/api/admin/orders/${id}/printable?t=kitchen`)).status, o2.id);
    check(printable === 200, "print job for a live order: 200");

    console.log("7. 22:30 — the orders expire while every screen is open");
    // Accept order 2 so the kitchen has something in progress when it expires.
    await board.goto(`${BASE}/admin/orders/live`);
    await board.getByRole("button", { name: /ПРИЕМИ/ }).first().click({ timeout: 20_000 }).catch(() => undefined);
    await board.locator(`[data-testid="active-order-${n2}"]`).waitFor({ timeout: 20_000 });
    const home = await phone.newPage();
    await home.goto(`${BASE}/`);
    await home.locator('[data-testid="track-card"]').waitFor({ timeout: 15_000 });
    // What the retention filter sees after 22:30: the orders now belong to a day that has ended.
    const yesterday = new Date(Date.now() - 26 * 3600 * 1000);
    await prisma.order.updateMany({ where: { id: { in: [o1.id, o2.id] } }, data: { createdAt: yesterday } });
    await customer.waitForSelector('[data-testid="track-empty"]', { timeout: 25_000 });
    check((await customer.innerText("main")).includes("Проследяването е изтекло"), "the open tracking page clears itself");
    await shot(customer, "10-track-expired-mobile");
    await board.locator(`[data-testid="active-order-${n2}"]`).waitFor({ state: "detached", timeout: 25_000 });
    check(true, "the kitchen board empties itself");
    await shot(board, "11-kitchen-after-cutoff");
    await home.reload();
    await sleep(3000);
    check(!(await home.locator('[data-testid="track-card"]').isVisible()), "the home card is gone");
    const gone = await board.evaluate(async (id) => (await fetch(`/api/admin/orders/${id}/printable?t=kitchen`)).status, o2.id);
    check(gone === 410, "printing an expired order: 410", String(gone));
    const detail = await staff.newPage();
    const resp = await detail.goto(`${BASE}/admin/orders/${o2.id}`);
    check(resp?.status() === 404, "the admin detail page: 404", String(resp?.status()));
    const after = (await phone.cookies(BASE)).find((c) => c.name === "pp_track");
    check(!after, "the tracking cookie is dropped once its orders are gone");

    console.log("8. The maintenance job deletes them");
    const secret = process.env.MAINTENANCE_SECRET ?? "";
    const run = await fetch(`${BASE}/api/maintenance/run`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    const body = (await run.json().catch(() => ({}))) as { purge?: { deletedOrders?: number } };
    check(run.status === 200 && (body.purge?.deletedOrders ?? 0) >= 2, "POST /api/maintenance/run purged them", JSON.stringify(body));
    const left = await prisma.order.count({ where: { id: { in: [o1.id, o2.id] } } });
    const leftItems = await prisma.orderItem.count({ where: { orderId: { in: [o1.id, o2.id] } } });
    const leftJobs = await prisma.emailOutbox.count({ where: { orderId: { in: [o1.id, o2.id] } } });
    check(left === 0 && leftItems === 0 && leftJobs === 0, "no order, line or e-mail job left", `${left}/${leftItems}/${leftJobs}`);
    const unauth = await fetch(`${BASE}/api/maintenance/run`, { method: "POST", headers: { authorization: "Bearer wrong" } });
    check(unauth.status === 401, "the endpoint refuses a wrong secret");

    // ── 9. The FINAL combo rule in the browser: only standard pizzas, only
    //    when the pair is strictly above the package price.
    const cartPage = await phone.newPage();
    const addToCart = async (slug: string, productId: string, size: 30 | 40) => {
      await cartPage.goto(`${BASE}/product/${slug}`);
      // Always pick the size: the page may remember the last one chosen.
      await cartPage.getByRole("button", { name: new RegExp(`^${size} см`) }).first().click();
      const before = await cartPage.evaluate(() => localStorage.getItem("pp-cart") ?? "");
      await cartPage.getByRole("button", { name: "Добави в количката" }).first().click();
      await cartPage.waitForFunction(
        ([id, prev]) => {
          const now = localStorage.getItem("pp-cart") ?? "";
          return now.includes(id) && now !== prev;
        },
        [productId, before] as [string, string]
      );
    };
    const checkoutAndPlace = async (name: string) => {
      await cartPage.goto(`${BASE}/checkout`);
      await cartPage.locator('[name="customerName"]').waitFor();
      await cartPage.locator('[name="customerName"]').fill(name);
      await cartPage.locator('[name="customerPhone"]').fill("0888111333");
      await cartPage.locator('[name="customerEmail"]').fill("tracking-e2e@example.test");
      await cartPage.locator('[name="deliveryAddress"]').fill("ул. Тестова 8");
      for (const n of ["consentTerms", "consentRefunds", "consentPrivacy"]) {
        await cartPage.locator(`input[name="${n}"]`).check();
      }
      const checkoutText = await cartPage.locator("main").innerText();
      await cartPage.locator('[data-testid="place-order"]').click();
      await cartPage.waitForURL(/order-success/, { timeout: 30_000 });
      const n = Number(/#(\d+)/.exec(await cartPage.locator("main").innerText())?.[1]);
      return { checkoutText, order: await prisma.order.findFirstOrThrow({ where: { orderNumber: n } }) };
    };
    const expire = async (id: string) => {
      await prisma.order.updateMany({ where: { id }, data: { createdAt: new Date(Date.now() - 26 * 3600 * 1000) } });
      await fetch(`${BASE}/api/maintenance/run`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    };

    console.log("9a. A pair that would NOT save (Маргарита 30 + Кашкавалина 40): regular price, no offer anywhere");
    await addToCart("margarita", "prod_margarita", 30);
    await addToCart("kashkavalina", "prod_kashkavalina", 40);
    await cartPage.goto(`${BASE}/cart`);
    await cartPage.locator('[data-testid="cart-total"]').first().waitFor();
    const cartA = await cartPage.locator("main").innerText();
    check((await cartPage.locator('[data-testid="cart-total"]').first().innerText()) === "16.88 €", "basket total 16.88 € (regular)");
    check((await cartPage.locator('[data-testid="cart-combo"]').count()) === 0, "basket: no combo line");
    check(
      (await cartPage.locator('[data-testid="cart-discount"], [data-testid="cart-surcharge"]').count()) === 0,
      "basket: no discount and no difference line"
    );
    check(!/Разлика до пакетната цена|--|−−|-−/.test(cartA), "basket: nothing about a package price");
    await shot(cartPage, "14-cart-pair-without-saving-mobile");
    const a = await checkoutAndPlace("Тест Без Пакет");
    check(!/Оферта 2 пици|Отстъпка|Разлика до пакетната цена/.test(a.checkoutText), "checkout: no offer shown");
    check(
      Number(a.order.subtotalEur) === 16.88 && Number(a.order.discountEur) === 0 && Number(a.order.totalEur) === 16.88,
      "saved: 16.88, discount 0",
      `${a.order.subtotalEur}/${a.order.discountEur}/${a.order.totalEur}`
    );
    check(!a.order.offerJson || a.order.offerJson === "[]", "saved: no combo snapshot", String(a.order.offerJson));
    await board.goto(`${BASE}/admin/orders/live`);
    await board.getByText(`#${a.order.orderNumber}`).first().waitFor({ timeout: 20_000 });
    check((await board.locator('[data-testid="live-combo"]').count()) === 0, "kitchen card: no combo line");
    const detailA = await staff.newPage();
    await detailA.goto(`${BASE}/admin/orders/${a.order.id}`);
    await detailA.getByText(String(a.order.orderNumber)).first().waitFor({ timeout: 20_000 });
    check((await detailA.locator('[data-testid="order-adjustment"]').count()) === 0, "admin order page: no offer line");
    check((await detailA.locator("body").innerText()).includes("16.88 €"), "admin order page: 16.88 €");
    await shot(detailA, "16-admin-order-pair-without-saving");
    const printA = await staff.newPage();
    await printA.goto(`${BASE}/admin/orders/${a.order.id}/print?t=delivery`);
    const printedA = await printA.locator("body").innerText();
    check(!/Оферта|Отстъпка|Разлика до пакетната цена/.test(printedA) && /16\.88 €/.test(printedA), "print page: regular price, no offer");
    await expire(a.order.id);

    console.log("9b. Two standard pizzas + a special (Пеперони 40 + Пеперони 30 + Сьомга 30): only the standard pair");
    await addToCart("syomga", "prod_syomga", 30);
    await addToCart("peperoni-maks", "prod_peperoni_maks", 40);
    await addToCart("peperoni-maks", "prod_peperoni_maks", 30);
    await cartPage.goto(`${BASE}/cart`);
    await cartPage.locator('[data-testid="cart-total"]').first().waitFor();
    const cartB = await cartPage.locator("main").innerText();
    check((await cartPage.locator('[data-testid="cart-combo"]').count()) === 1, "basket: exactly one combo");
    check(/Оферта 2 пици 40 \+ 30 см \(редовно 22\.49 €\)/.test(cartB), "basket: the standard pair, regular 22.49 €", cartB.slice(0, 500));
    check((await cartPage.locator('[data-testid="cart-discount"]').first().innerText()) === "−3.06 €", "basket: discount −3.06 €");
    check((await cartPage.locator('[data-testid="cart-total"]').first().innerText()) === "31.19 €", "basket total 31.19 €");
    await shot(cartPage, "15-cart-standard-pair-with-special-mobile");
    const b = await checkoutAndPlace("Тест Със Специална");
    check(b.checkoutText.includes("−3.06 €") && b.checkoutText.includes("31.19 €"), "checkout: the same discount and total");
    check(
      Number(b.order.subtotalEur) === 34.25 && Number(b.order.discountEur) === 3.06 && Number(b.order.totalEur) === 31.19,
      "saved: 34.25 − 3.06 = 31.19",
      `${b.order.subtotalEur}/${b.order.discountEur}/${b.order.totalEur}`
    );
    const salmonLine = await prisma.orderItem.findFirst({ where: { orderId: b.order.id, productId: "prod_syomga" } });
    check(Number(salmonLine?.discountEur ?? -1) === 0, "saved: the special pays in full");
    await board.goto(`${BASE}/admin/orders/live`);
    const combo = board.locator('[data-testid="live-combo"]').first();
    await combo.waitFor({ timeout: 20_000 });
    const comboText = await combo.innerText();
    check(/Отстъпка „Грешна математика“: −3\.06 €/.test(comboText), "kitchen card: discount −3.06 €", comboText);
    await shot(board, "17-kitchen-standard-pair-with-special");
    const detailB = await staff.newPage();
    await detailB.goto(`${BASE}/admin/orders/${b.order.id}`);
    const adjB = await detailB.locator('[data-testid="order-adjustment"]').innerText();
    check(/Отстъпка „Грешна математика“\s*−3\.06 €/.test(adjB), "admin order page: discount −3.06 €", adjB);
    const printB = await staff.newPage();
    await printB.goto(`${BASE}/admin/orders/${b.order.id}/print?t=delivery`);
    const printedB = await printB.locator("body").innerText();
    check(/Отстъпка „Грешна математика“\s+-3\.06 €/.test(printedB) && /31\.19 €/.test(printedB), "print page: −3.06 €, total 31.19 €");
    check(!/--\d|-−|Разлика до пакетната цена/.test(printedB), "print page: one minus, no difference line");
    await shot(printB, "18c-print-standard-pair-with-special");
    await expire(b.order.id);

    check(errors.length === 0, "no page errors", errors.join(" | "));
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? "\nE2E OK" : `\nE2E FAILED — ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
