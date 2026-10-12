/**
 * BROWSER regression for the checkout around a language switch and around
 * requests that fail. Real Chrome via playwright-core against a running LOCAL
 * server and its local database.
 *
 *   A. EN form filled → switch to BG → everything kept → one order, confirmed
 *   B. BG → EN → BG, then order → one order, confirmed
 *   C. basket line edited (size + free topping) before ordering, switch
 *      language, order → saved total == the total shown before the button
 *   D. the order request answers 500 → readable error, form and basket kept,
 *      no crash, no order; the retry → one order
 *   E. the connection drops → same as D
 *   F. the order is SAVED but its reply is lost → the page finds the order by
 *      its key and confirms it; never a second order
 *   G. reply lost AND the follow-up check fails → error; a reload then finds
 *      the order and confirms it; still one order
 *   H. slow server + triple click → one order
 *   I. a hand-made /order-success?n=… (no receipt) does NOT say "received"
 *
 * Cash orders only, tagged with their own e-mail and deleted at the end.
 * Start the server WITHOUT the Resend key so nothing is e-mailed:
 *   RESEND_API_KEY= npm run start
 *   E2E_BASE_URL=http://localhost:3000 npm run e2e:checkout-language
 */
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";
import { db } from "@/lib/db";
import { getAppEnv } from "@/lib/app-env";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = "lang-e2e@example.test";

if (getAppEnv() === "production") {
  console.error("Refusing to run against APP_ENV=production.");
  process.exit(1);
}

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const ordersMade = () => db.order.count({ where: { customerEmail: EMAIL } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isOrderAction = (route: Route) =>
  route.request().method() === "POST" && !!route.request().headers()["next-action"];

/** A fresh context with 2 × "My Pazzo" 30 cm (19.42 € — above the 10 € minimum). */
async function freshCheckout(browser: Browser, locale: "bg" | "en"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("    [browser]", m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => console.log("    [pageerror]", e.message.slice(0, 300)));
  const prefix = locale === "en" ? "/en" : "";
  await page.goto(`${BASE}${prefix}/product/moyata-patso`);
  await page.getByRole("button", { name: locale === "en" ? "Add to basket" : "Добави в количката" }).first().click();
  await page.waitForFunction(() => (localStorage.getItem("pp-cart") ?? "").includes("prod_moyata_patso"));
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("pp-cart")!);
    c.state.items[0].quantity = 2;
    localStorage.setItem("pp-cart", JSON.stringify(c));
  });
  await page.goto(`${BASE}${prefix}/checkout`);
  await page.locator('[name="customerName"]').waitFor();
  return { ctx, page };
}

async function fill(page: Page, tag: string) {
  await page.locator('[name="customerName"]').fill("Език Тест");
  await page.locator('[name="customerPhone"]').fill("0888111444");
  await page.locator('[name="customerEmail"]').fill(EMAIL);
  await page.locator('[name="deliveryAddress"]').fill(`ул. Тестова 9 (${tag})`);
  for (const name of ["consentTerms", "consentRefunds", "consentPrivacy"]) {
    await page.locator(`input[name="${name}"]`).check();
  }
}

async function switchTo(page: Page, locale: "bg" | "en") {
  await page.locator(`button[lang="${locale === "en" ? "en-GB" : "bg"}"]:visible`).first().click();
  await page.waitForFunction((l) => document.documentElement.lang.startsWith(l), locale);
  await page.locator('[name="customerName"]').waitFor();
}

async function formKept(page: Page, tag: string): Promise<boolean> {
  const name = await page.locator('[name="customerName"]').inputValue();
  const addr = await page.locator('[name="deliveryAddress"]').inputValue();
  const ticks = await Promise.all(
    ["consentTerms", "consentRefunds", "consentPrivacy"].map((n) => page.locator(`input[name="${n}"]`).isChecked())
  );
  return name === "Език Тест" && addr.includes(tag) && ticks.every(Boolean);
}

const submit = (page: Page) => page.locator('form button[type="submit"]').click();

async function confirmed(page: Page): Promise<boolean> {
  await page.waitForURL(/order-success/, { timeout: 30_000 });
  const text = await page.locator("main").innerText();
  return /Благодарим за поръчката|Thank you for your order/.test(text) && /#\d+/.test(text);
}

const NETWORK_ERROR = /Не получихме отговор от сървъра|We did not get a reply from the server/;

async function main() {
  const startCount = await ordersMade();
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  try {
    // ── A ──
    console.log("A. EN → BG, then order");
    {
      const { ctx, page } = await freshCheckout(browser, "en");
      const before = await ordersMade();
      await fill(page, "A");
      await switchTo(page, "bg");
      check(new URL(page.url()).pathname === "/checkout", "on /checkout after the switch");
      check(await formKept(page, "A"), "typed details and ticks survive EN → BG");
      await submit(page);
      check(await confirmed(page), "confirmation shown after the order");
      check((await ordersMade()) === before + 1, "exactly one order saved");
      await ctx.close();
    }

    // ── B ──
    console.log("B. BG → EN → BG, then order");
    {
      const { ctx, page } = await freshCheckout(browser, "bg");
      const before = await ordersMade();
      await fill(page, "B");
      await switchTo(page, "en");
      check(new URL(page.url()).pathname === "/en/checkout", "on /en/checkout");
      check(await formKept(page, "B"), "kept after BG → EN");
      await switchTo(page, "bg");
      check(await formKept(page, "B"), "kept after EN → BG");
      await submit(page);
      check(await confirmed(page), "confirmation shown");
      check((await ordersMade()) === before + 1, "exactly one order saved");
      await ctx.close();
    }

    // ── C ──
    console.log("C. edit the basket line, switch language, order");
    {
      const { ctx, page } = await freshCheckout(browser, "en");
      const before = await ordersMade();
      await page.goto(`${BASE}/en/cart`);
      await page.getByRole("link", { name: /^Edit / }).first().click();
      await page.getByRole("button", { name: "Save changes" }).waitFor();
      // The edit page is server-rendered; wait until it is hydrated and has
      // loaded the basket line, or the clicks below land on inert markup.
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() =>
        (document.querySelector('[data-testid="product-total"]')?.textContent ?? "").includes("19.42")
      );
      await page.getByRole("button", { name: /^40 cm/ }).first().click();
      await page.getByRole("button", { name: /Up to 3 free/ }).click();
      await page.getByRole("button", { name: /Free topping: meat/ }).click();
      // A REAL mouse click, with the free-topping list still open: closing that
      // list on mousedown used to move this button before the mouseup, and the
      // click was lost (components/cart/ProductExtrasPicker.tsx).
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForFunction(() => location.pathname === "/en/cart", undefined, { timeout: 15_000 });
      check(true, "Save changes (real click, list open) returns to the basket");
      await page.goto(`${BASE}/en/checkout`);
      await fill(page, "C");
      await switchTo(page, "bg");
      const shown = (await page.locator('[data-testid="checkout-final-total"]').innerText()).match(/(\d+\.\d{2})\s*€/)?.[1];
      await submit(page);
      check(await confirmed(page), "confirmation shown");
      check((await ordersMade()) === before + 1, "exactly one order saved");
      const order = await db.order.findFirst({
        where: { customerEmail: EMAIL, deliveryAddress: { contains: "(C)" } },
        include: { items: true },
      });
      check(shown === "25.56", "the page showed 2 × 12.78 = 25.56 € (40 cm, free topping 0 €)", shown);
      check(Number(order?.totalEur).toFixed(2) === shown, "saved total equals the shown total", `${order?.totalEur} vs ${shown}`);
      check(order?.items[0]?.extrasJson.includes("free_meat_topping") ?? false, "the free topping is on the saved line");
      await ctx.close();
    }

    // ── D / E ──
    for (const [label, fault] of [
      ["D. the order request answers 500", "500"],
      ["E. the connection drops", "abort"],
    ] as const) {
      console.log(label);
      const { ctx, page } = await freshCheckout(browser, "bg");
      const before = await ordersMade();
      await fill(page, fault);
      await page.route("**/*", (route) => {
        if (!isOrderAction(route)) return route.continue();
        return fault === "500"
          ? route.fulfill({ status: 500, contentType: "text/html", body: "<h1>Internal Server Error</h1>" })
          : route.abort("connectionreset");
      });
      await submit(page);
      await page.getByText(NETWORK_ERROR).first().waitFor({ timeout: 20_000 });
      check(true, "a readable error is shown");
      check(!(await page.getByText("Application error").count()), "no client-side crash");
      check(await formKept(page, fault), "everything typed is kept");
      check(await page.locator('form button[type="submit"]').isEnabled(), "the button can be pressed again");
      check((await ordersMade()) === before, "no order saved");
      await page.unroute("**/*");
      await submit(page);
      check(await confirmed(page), "the retry is confirmed");
      check((await ordersMade()) === before + 1, "exactly one order after the retry");
      await ctx.close();
    }

    // ── F ──
    console.log("F. order saved, reply lost");
    {
      const { ctx, page } = await freshCheckout(browser, "en");
      const before = await ordersMade();
      await fill(page, "F");
      let n = 0;
      await page.route("**/*", async (route) => {
        if (!isOrderAction(route) || n++ > 0) return route.continue();
        await route.fetch(); // reaches the server: the order IS created
        await route.abort("connectionreset"); // …but the browser never hears back
      });
      await submit(page);
      check(await confirmed(page), "the page found the saved order and confirmed it");
      check((await ordersMade()) === before + 1, "exactly one order");
      await ctx.close();
    }

    // ── G ──
    console.log("G. reply lost and the follow-up check fails; then reload");
    {
      const { ctx, page } = await freshCheckout(browser, "bg");
      const before = await ordersMade();
      await fill(page, "G");
      let n = 0;
      await page.route("**/*", async (route) => {
        if (!isOrderAction(route)) return route.continue();
        if (n++ === 0) await route.fetch();
        await route.abort("connectionreset");
      });
      await submit(page);
      await page.getByText(NETWORK_ERROR).first().waitFor({ timeout: 20_000 });
      check(true, "error shown while the server cannot be reached");
      check((await ordersMade()) === before + 1, "the order exists on the server");
      await page.unroute("**/*");
      await page.reload();
      check(await confirmed(page), "after a reload the page finds the order and confirms it");
      check((await ordersMade()) === before + 1, "still exactly one order");
      await ctx.close();
    }

    // ── H ──
    console.log("H. slow server, triple click");
    {
      const { ctx, page } = await freshCheckout(browser, "en");
      const before = await ordersMade();
      await fill(page, "H");
      let posts = 0;
      await page.route("**/*", async (route) => {
        if (!isOrderAction(route)) return route.continue();
        posts++;
        await sleep(3000);
        return route.continue();
      });
      const button = page.locator('form button[type="submit"]');
      await button.click();
      await button.click({ force: true }).catch(() => {});
      await button.click({ force: true }).catch(() => {});
      check(await button.isDisabled(), "the button is disabled while the order is sent");
      check(await confirmed(page), "confirmation shown");
      check(posts === 1, "one request sent", `${posts}`);
      check((await ordersMade()) === before + 1, "exactly one order");
      await ctx.close();
    }

    // ── J ──
    console.log("J. paid-toppings list open, real click on 'Add to basket'");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/product/moyata-patso`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: /Платени добавки/ }).click();
      await page.getByRole("button", { name: /Месна добавка/ }).click();
      await page.getByRole("button", { name: /Добави в количката/ }).click();
      const added = await page
        .waitForFunction(() => (localStorage.getItem("pp-cart") ?? "").includes("meat_addon"), undefined, { timeout: 5_000 })
        .then(() => true, () => false);
      check(added, "the first click adds the pizza with its paid topping");
      await ctx.close();
    }

    // ── I ──
    console.log("I. a hand-made confirmation URL");
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const any = await db.order.findFirst({ where: { customerEmail: EMAIL }, select: { orderNumber: true } });
      await page.goto(`${BASE}/order-success?n=${any?.orderNumber ?? 1}`);
      const text = await page.locator("main").innerText();
      check(!/Благодарим за поръчката/.test(text), "no 'thank you' without the receipt");
      check(/Не можем да потвърдим/.test(text), "says it cannot confirm");
      await page.goto(`${BASE}/order-success?n=${any?.orderNumber ?? 1}&r=${"x".repeat(32)}`);
      check(/Не можем да потвърдим/.test(await page.locator("main").innerText()), "a forged receipt is refused");
      await ctx.close();
    }
  } finally {
    await browser.close();
    const mine = await db.order.findMany({ where: { customerEmail: EMAIL }, select: { id: true, orderNumber: true } });
    console.log(`\nthis run saved ${mine.length - startCount} order(s): ${mine.map((o) => `#${o.orderNumber}`).join(", ") || "—"}`);
    await db.orderItem.deleteMany({ where: { orderId: { in: mine.map((o) => o.id) } } });
    await db.order.deleteMany({ where: { id: { in: mine.map((o) => o.id) } } });
    console.log(`cleaned up ${mine.length} test order(s)`);
    await db.$disconnect();
  }

  if (failures > 0) {
    console.error(`\nE2E CHECKOUT/LANGUAGE FAILED (${failures})`);
    process.exit(1);
  }
  console.log("\nE2E CHECKOUT/LANGUAGE OK");
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
