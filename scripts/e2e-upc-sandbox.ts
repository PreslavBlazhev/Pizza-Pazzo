/**
 * Browser E2E for ОББ's UPC TEST terminal on a running server configured as
 * the live site will be during the bank tests:
 *
 *   PAYMENT_PROVIDER=upc PAYMENT_ENV=sandbox PAYMENT_SANDBOX_AUDIENCE=staff
 *   PAYMENT_CURRENCY=EUR UPC_MERCHANT_ID=1731096 UPC_TERMINAL_ID=E7059096
 *   UPC_PRIVATE_KEY=<base64 PEM>  (never printed)
 *
 *   E2E_BASE_URL=http://localhost:3020 node --env-file=.env --import tsx scripts/e2e-upc-sandbox.ts
 *
 * Checks, on a phone and a desktop viewport, in BG and EN: a guest gets no
 * card option; a staff member does, marked as the bank TEST environment;
 * the review page shows the test notice, the server-priced amount and the
 * merchant with its country; "Pay" posts the signed form and the browser
 * really lands on UPC's page at ecg.test.upc.ua/kbc/…; the order is a test
 * order, not in the kitchen. Then NOTIFY/SUCCESS/FAILURE answer as specified
 * to unsigned requests, and the admin shows the three portal URLs.
 *
 * It does NOT complete a bank payment: that needs ОББ to upload 1731096.crt
 * and the NOTIFY_URL to be public (docs/UBB-UPC-TEST-REPORT.md).
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3020").replace(/\/$/, "");
const SHOTS = path.join(process.cwd(), "docs", "ubb-evidence", "upc-2026-10-29");
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(ok: boolean, label: string, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, isMobile: true },
  { name: "desktop", width: 1280, height: 800, isMobile: false },
];

async function basket(page: Page, prefix: string, locale: "bg" | "en") {
  await page.goto(`${BASE}${prefix}/product/moyata-patso`);
  await page.getByRole("button", { name: locale === "en" ? "Add to basket" : "Добави в количката" }).first().click();
  await page.waitForFunction(() => (localStorage.getItem("pp-cart") ?? "").includes("prod_moyata_patso"));
  // Two pizzas: above the 10 € delivery minimum, and the two-pizza combo applies.
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("pp-cart")!);
    c.state.items[0].quantity = 2;
    localStorage.setItem("pp-cart", JSON.stringify(c));
  });
}

async function main() {
  const email = `upc-e2e-${Date.now()}@example.test`;
  const password = `e2e-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  await db.user.create({
    data: { email, passwordHash: await hashPassword(password), fullName: "UPC Тест", role: "ADMIN" },
  });
  const made: number[] = [];
  const browser: Browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  try {
    for (const vp of VIEWPORTS) {
      for (const locale of ["bg", "en"] as const) {
        const prefix = locale === "en" ? "/en" : "";
        console.log(`${vp.name} / ${locale}`);

        // Guest: no card option at all.
        {
          const ctx = await browser.newContext({ viewport: vp, isMobile: vp.isMobile });
          const page = await ctx.newPage();
          await basket(page, prefix, locale);
          await page.goto(`${BASE}${prefix}/checkout`);
          await page.locator('[name="customerName"]').waitFor();
          check((await page.locator('input[value="card_online"]').count()) === 0, "guest: no card option");
          const merchant = await page.locator('[data-testid="merchant-identity"]').innerText();
          check(merchant.includes(locale === "en" ? "Bulgaria" : "България") && merchant.includes("203300275"), "checkout: merchant, UIC and country next to the total", merchant);
          await ctx.close();
        }

        // Staff: the sandbox card option, then UPC's page.
        const ctx = await browser.newContext({ viewport: vp, isMobile: vp.isMobile });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/auth/login`);
        await page.locator('main [name="email"]').fill(email);
        await page.locator('main [name="password"]').fill(password);
        await page.locator('main button[type="submit"]').click();
        await page.waitForURL((u) => !u.pathname.includes("/auth/login"), { timeout: 20_000 });
        await basket(page, prefix, locale);
        await page.goto(`${BASE}${prefix}/checkout`);
        await page.locator('[name="customerName"]').waitFor();
        const card = page.locator('input[value="card_online"]');
        check((await card.count()) === 1, "staff: card option offered");
        const optionText = await page.locator("label", { has: card }).innerText();
        check(/ТЕСТОВА|TEST/.test(optionText), "the option says it is the bank TEST environment", optionText);
        await page.locator("label", { has: card }).click();
        const finalTotal = (await page.locator('[data-testid="checkout-final-total"]').innerText()).match(/(\d+\.\d{2})/)?.[1];
        await page.locator('[name="customerName"]').fill("UPC Тест");
        await page.locator('[name="customerPhone"]').fill("0888111444");
        await page.locator('[name="customerEmail"]').fill("upc-e2e@example.test");
        await page.locator('[name="deliveryAddress"]').fill(`ул. Тестова 9 (UPC ${vp.name} ${locale})`);
        for (const n of ["consentTerms", "consentRefunds", "consentPrivacy"]) await page.locator(`input[name="${n}"]`).check();
        await page.locator('[data-testid="place-order"]').click();
        await page.waitForURL(/\/checkout\/pay\//, { timeout: 30_000 });
        const token = page.url().split("/checkout/pay/")[1].split(/[?#]/)[0];
        const order = await db.order.findUnique({ where: { accessToken: token } });
        if (order) made.push(order.orderNumber);
        check(!!order && order.isTest && order.paymentStatus === "AWAITING_PAYMENT" && !order.releasedToKitchenAt, "order saved as a TEST card order, not in the kitchen");
        check(!!order && Number(order.totalEur).toFixed(2) === finalTotal, "server total = the total the customer saw", `${order?.totalEur} vs ${finalTotal}`);
        const text = await page.locator("main").innerText();
        check(locale === "en" ? /TEST MODE — the payment goes through the bank's test environment/.test(text) : /ТЕСТОВ РЕЖИМ — плащането минава през тестовата среда на банката/.test(text), "review page: bank test notice");
        check(/UPC eCommerce Connect/.test(text), "review page names UPC eCommerce Connect");
        check(text.includes(locale === "en" ? "Bulgaria" : "България"), "review page: merchant with country");
        check(!/Google Pay|Apple Pay/i.test(text), "no wallet claims on our page");
        await page.screenshot({ path: path.join(SHOTS, `review-${locale}-${vp.name}.png`), fullPage: true });

        await page.locator('form[action="/api/payments/start"] button[type="submit"]').click();
        await page.waitForURL((u) => u.hostname === "ecg.test.upc.ua", { timeout: 45_000 });
        check(new URL(page.url()).pathname.startsWith("/kbc/pay"), "the browser reached UPC's KBC payment page", page.url());
        await page.waitForLoadState("domcontentloaded");
        const upcText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300);
        console.log(`    UPC page says: ${upcText}`);
        await page.screenshot({ path: path.join(SHOTS, `upc-page-${locale}-${vp.name}.png`), fullPage: true });
        const attempt = await db.paymentAttempt.findFirst({ where: { orderId: order?.id }, orderBy: { createdAt: "desc" } });
        check(!!attempt && attempt.provider === "UPC" && attempt.environment === "sandbox" && attempt.status === "REDIRECTED", "attempt: UPC / sandbox / redirected");
        const sent = JSON.parse(attempt?.redirectFormJson ?? "{}");
        check(sent.MerchantID === "1731096" && sent.TerminalID === "E7059096" && sent.Currency === "978" && sent.locale === locale, "signed fields: MID, TID, 978, locale", JSON.stringify({ ...sent, Signature: "…" }));
        check(sent.TotalAmount === String(Math.round(Number(order?.totalEur) * 100)), "TotalAmount in cents = stored total");
        await ctx.close();
      }
    }

    console.log("bank endpoints");
    {
      const notify = await fetch(`${BASE}/api/payments/upc/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "MerchantID=1731096&TerminalID=E7059096&OrderID=PP1-FAKE&TranCode=000&TotalAmount=100&Currency=978&Signature=AAAA",
      });
      const nb = await notify.text();
      check(notify.status === 200 && /text\/plain/.test(notify.headers.get("content-type") ?? ""), "NOTIFY answers 200 text/plain without a session");
      check(/^Response\.action=reverse$/m.test(nb) && /^OrderID=PP1-FAKE$/m.test(nb), "unsigned NOTIFY → Response.action=reverse", nb);
      check((await fetch(`${BASE}/api/payments/upc/notify`)).status === 405, "NOTIFY GET → 405");
      for (const kind of ["success", "failure"]) {
        const r = await fetch(`${BASE}/api/payments/upc/${kind}`, {
          method: "POST",
          redirect: "manual",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "OrderID=PP1-FAKE&TranCode=000&Signature=AAAA",
        });
        check(r.status === 303 && (r.headers.get("location") ?? "").endsWith("/payment/return"), `${kind.toUpperCase()}_URL: unsigned → neutral page (303)`, `${r.status} ${r.headers.get("location")}`);
      }
    }

    console.log("admin");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/auth/login`);
      await page.locator('main [name="email"]').fill(email);
      await page.locator('main [name="password"]').fill(password);
      await page.locator('main button[type="submit"]').click();
      await page.waitForURL((u) => !u.pathname.includes("/auth/login"), { timeout: 20_000 });
      await page.goto(`${BASE}/admin/settings`);
      await page.getByText("NOTIFY_URL").first().waitFor();
      const t = await page.locator("body").innerText();
      for (const p of ["success", "failure", "notify"]) check(t.includes(`${BASE}/api/payments/upc/${p}`), `settings show the ${p.toUpperCase()}_URL`);
      check(/upc \/ sandbox/.test(t), "settings: provider upc / sandbox");
      await page.screenshot({ path: path.join(SHOTS, "admin-settings-upc.png"), fullPage: true });
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (made.length) {
      await db.order.deleteMany({ where: { orderNumber: { in: made } } });
      console.log(`cleaned up test orders ${made.map((n) => `#${n}`).join(", ")}`);
    }
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
  console.log(failures === 0 ? "\nE2E UPC SANDBOX OK" : `\nE2E UPC SANDBOX: ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
