/**
 * Every legal link on the CHECKOUT page, in BG and EN, on a phone and a
 * desktop — opened in a real Chrome (playwright-core, the installed browser).
 *
 * Never submits the form: the submit button is not clicked, and the run
 * fails if any POST leaves the page (a server action = an order attempt) or
 * if the number of orders in the database changes.
 *
 * For each link it checks: the expected document path (with /en for English),
 * it opens in a new tab, the document answers 200 and renders its heading,
 * it is not the 404 page, and the checkout tab keeps the cart and the text
 * already typed.
 *
 *   npm run dev          (any local server; no simulator needed)
 *   npm run e2e:checkout-links
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { getAppEnv } from "@/lib/app-env";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = process.env.E2E_SHOTS ?? path.join(process.cwd(), "docs", "ubb-evidence", "checkout-links");
if (getAppEnv() === "production" || !/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("Local, non-production servers only.");
  process.exit(1);
}

/** The documents checkout must link to, in the order they appear. */
const EXPECTED = ["/delivery", "/payment-methods", "/terms", "/refunds", "/privacy"];

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const ordersBefore = await db.order.count();
  const product = await db.menuProduct.findFirstOrThrow({
    where: { isAvailable: true, variants: { some: {} } },
    orderBy: { sortOrder: "asc" },
    select: { slug: true },
  });
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  const posts: string[] = [];

  try {
    for (const locale of ["bg", "en"] as const) {
      for (const [vp, viewport] of [
        ["mobile", { width: 390, height: 844 }],
        ["desktop", { width: 1280, height: 800 }],
      ] as const) {
        const prefix = locale === "en" ? "/en" : "";
        console.log(`\n${locale.toUpperCase()} · ${vp}`);
        const ctx = await browser.newContext({ viewport });
        // Listen on the CONTEXT, before anything opens, so a new tab's
        // document response is never missed.
        const docStatus = new Map<string, number>();
        ctx.on("request", (r) => {
          if (r.method() === "POST") posts.push(`${r.method()} ${r.url()}`);
        });
        ctx.on("response", (r) => {
          if (r.request().resourceType() === "document") docStatus.set(new URL(r.url()).pathname, r.status());
        });
        const page = await ctx.newPage();

        await page.goto(`${BASE}${prefix}/product/${product.slug}`);
        await page.locator("main button").filter({ hasText: locale === "en" ? "Add to cart" : "Добави в количката" }).first().click();
        await page.waitForFunction(() => (localStorage.getItem("pp-cart") ?? "").includes('"items":[{'));
        await page.goto(`${BASE}${prefix}/checkout`);
        await page.locator('[name="deliveryAddress"]').fill(`links-check ${locale} ${vp}`);

        const hrefs = await page
          .locator('form a[target="_blank"]')
          .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
        check(
          JSON.stringify(hrefs) === JSON.stringify(EXPECTED.map((p) => `${prefix}${p}`)),
          "checkout links exactly the five documents",
          JSON.stringify(hrefs)
        );

        for (const href of hrefs) {
          const link = page.locator(`form a[href="${href}"]`).first();
          const [tab] = await Promise.all([ctx.waitForEvent("page"), link.click()]);
          await tab.waitForLoadState("domcontentloaded");
          await tab.locator("h1").first().waitFor({ timeout: 20_000 }).catch(() => {});
          const status = docStatus.get(href) ?? 0;
          const h1 = (await tab.locator("h1").first().innerText().catch(() => "")).trim();
          const notFound = status === 404 || h1 === "404" || /не е намерена|not found/i.test(h1);
          check(
            status === 200 && new URL(tab.url()).pathname === href && h1.length > 0 && !notFound,
            `${href} → ${status}, new tab, "${h1}"`,
            `status ${status}, url ${tab.url()}, 404=${notFound}`
          );
          if (href.endsWith("/payment-methods")) await tab.screenshot({ path: path.join(SHOTS, `${locale}-${vp}-payment-methods.png`) });
          await tab.close();
        }

        check(
          (await page.locator('[name="deliveryAddress"]').inputValue()) === `links-check ${locale} ${vp}`,
          "typed text kept on the checkout tab"
        );
        const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("pp-cart") ?? "{}").state?.items?.length ?? 0);
        check(cart > 0, "cart kept on the checkout tab");
        await page.screenshot({ path: path.join(SHOTS, `${locale}-${vp}-checkout.png`), fullPage: true });
        await ctx.close();
      }
    }
    // The "order waiting for payment" reminder: hidden on the payment result
    // pages, but NOT on /payment-methods (it used to match "/payment*").
    console.log("\npending-payment reminder");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/terms`);
      await page.evaluate(() =>
        localStorage.setItem(
          "pp-pending-payment",
          JSON.stringify({ token: "links-check-token", orderNumber: 9999, startedAt: Date.now() })
        )
      );
      const notice = page.getByText("Поръчка №9999 чака плащане.");
      await page.goto(`${BASE}/payment-methods`);
      const shown = await notice.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
      check(shown, "reminder shows on /payment-methods");
      // A result page without a valid token redirects home (where the
      // reminder belongs), so use a URL that stays under a hidden prefix.
      await page.goto(`${BASE}/payment-simulator/links-check-no-such-session`);
      await page.waitForTimeout(3000);
      check(new URL(page.url()).pathname === "/payment-simulator/links-check-no-such-session", "still on the simulator URL");
      check(!(await notice.isVisible()), "reminder hidden on /payment-simulator/*");
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  check(posts.length === 0, "no POST left the browser (nothing was submitted)", posts.join(", "));
  check((await db.order.count()) === ordersBefore, "no order was created");
  await db.$disconnect();

  console.log(`\nscreenshots: ${SHOTS}`);
  if (failures > 0) {
    console.error(`\nCHECKOUT LINKS FAILED (${failures})`);
    process.exit(1);
  }
  console.log("\nCHECKOUT LINKS OK");
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
