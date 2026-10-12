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
 *   K. „Грешна математика“ in the basket, BG and EN: 2 pizzas → discount
 *      line; a 3rd → normal prices and the hint; back to 2 → discount again;
 *      checkout shows the same total the order is saved with
 *   L. below the minimum after the offer: the remaining amount is named and
 *      the way forward is closed
 *   M. an old basket with a product no longer on sale: named, blocked
 *   N. SIGNED IN: the header has its own "Sign out" submit button EARLIER in
 *      the page. The order button orders and keeps the session; the generic
 *      "first submit button" is Sign out → home page, no order — the cause of
 *      the old "landed on / without an order" report. The sign-out and an
 *      abandoned attempt both leave a line in the server log (E2E_SERVER_LOG)
 *
 * Every page is also watched for hydration errors (React #418 and kin).
 *
 * Cash orders only, tagged with their own e-mail and deleted at the end.
 * Start the server WITHOUT the Resend key so nothing is e-mailed:
 *   RESEND_API_KEY= npm run start
 *   E2E_BASE_URL=http://localhost:3000 npm run e2e:checkout-language
 */
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
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

const HYDRATION = /hydrat|did not match|didn't match|Minified React error #(418|419|421|422|423|425)/i;

/** Every page error and hydration message fails the run. */
function watchPage(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error") console.log("    [browser]", m.text().slice(0, 300));
    if ((m.type() === "error" || m.type() === "warning") && HYDRATION.test(m.text())) {
      check(false, "no hydration message", m.text().slice(0, 600));
    }
  });
  page.on("pageerror", (e) => check(false, "no page error", e.message.slice(0, 600)));
}

/** The server log written so far (E2E_SERVER_LOG), or null when not given. */
const SERVER_LOG = process.env.E2E_SERVER_LOG;
const serverLog = () => (SERVER_LOG ? readFileSync(SERVER_LOG, "utf8") : null);

const isOrderAction = (route: Route) =>
  route.request().method() === "POST" && !!route.request().headers()["next-action"];

/** A fresh context with 2 × "My Pazzo" 30 cm (19.42 € — above the 10 € minimum). */
async function freshCheckout(browser: Browser, locale: "bg" | "en"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  watchPage(page);
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

const submit = (page: Page) => page.locator('[data-testid="place-order"]').click();

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
      // 2 × 12.78 = 25.56 €, free topping 0 €; the pair 40 + 40 → 23.01 €.
      check(shown === "23.01", "the page showed 25.56 − 2.55 offer = 23.01 €", shown);
      check(Number(order?.totalEur).toFixed(2) === shown, "saved total equals the shown total", `${order?.totalEur} vs ${shown}`);
      check(
        Number(order?.subtotalEur) === 25.56 && Number(order?.discountEur) === 2.55,
        "saved: items 25.56, discount 2.55",
        `${order?.subtotalEur} / ${order?.discountEur}`
      );
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
      check(await page.locator('[data-testid="place-order"]').isEnabled(), "the button can be pressed again");
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
      const button = page.locator('[data-testid="place-order"]');
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

    // ── K ──
    for (const locale of ["bg", "en"] as const) {
      console.log(`K. „Грешна математика“ in the basket (${locale})`);
      const { ctx, page } = await freshCheckout(browser, locale);
      const prefix = locale === "en" ? "/en" : "";
      const money = async (id: string) =>
        (await page.locator(`[data-testid="${id}"]`).first().innerText()).match(/(\d+\.\d{2})/)?.[1] ?? null;
      await page.goto(`${BASE}${prefix}/cart`);
      await page.locator('[data-testid="cart-total"]').waitFor();
      check((await money("cart-subtotal")) === "19.42", "2 × 30 cm: items 19.42 €");
      check((await money("cart-discount")) === "2.55", "offer line −2.55 €");
      check((await money("cart-total")) === "16.87", "total 16.87 €");
      const offerName = locale === "en" ? /Wrong maths/ : /Грешна математика/;
      check(offerName.test(await page.locator("aside").first().innerText()), "the offer is named in this language");

      await page.getByRole("button", { name: locale === "en" ? /^Increase the quantity/ : /^Увеличи количеството/ }).click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="cart-discount"]'));
      check((await money("cart-total")) === "29.13", "3 pizzas: normal prices, 29.13 €");
      check(await page.locator('[data-testid="pizza-math-hint"]').isVisible(), "the hint says when the offer applies");

      await page.getByRole("button", { name: locale === "en" ? /^Reduce the quantity/ : /^Намали количеството/ }).click();
      await page.locator('[data-testid="cart-discount"]').waitFor();
      check((await money("cart-total")) === "16.87", "back to 2: 16.87 € again");

      await page.goto(`${BASE}${prefix}/checkout`);
      await page.locator('[name="customerName"]').waitFor();
      const final = (await page.locator('[data-testid="checkout-final-total"]').innerText()).match(/(\d+\.\d{2})\s*€/)?.[1];
      check(final === "16.87", "checkout: final amount 16.87 €", final);
      check((await money("cart-discount")) === "2.55", "checkout summary shows the discount");
      const before = await ordersMade();
      await fill(page, `K-${locale}`);
      await submit(page);
      check(await confirmed(page), "confirmation shown");
      check((await ordersMade()) === before + 1, "exactly one order saved");
      const order = await db.order.findFirst({ where: { customerEmail: EMAIL, deliveryAddress: { contains: `(K-${locale})` } } });
      check(
        Number(order?.subtotalEur) === 19.42 && Number(order?.discountEur) === 2.55 && Number(order?.totalEur) === 16.87,
        "saved 19.42 − 2.55 = 16.87",
        `${order?.subtotalEur} / ${order?.discountEur} / ${order?.totalEur}`
      );
      await ctx.close();
    }

    // ── L ──
    console.log("L. below the minimum");
    {
      const { ctx, page } = await freshCheckout(browser, "bg");
      // One Маргарита 30 cm, 6.65 € — 3.35 € short of 10 €.
      await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem("pp-cart")!);
        const it = c.state.items[0];
        it.product = { ...it.product, id: "prod_margarita", slug: "margarita", categoryId: "cat_pizzas_standard" };
        it.selectedVariant = { ...it.selectedVariant, id: "var_margarita_1", priceEur: 6.65 };
        it.unitPrice = 6.65;
        it.quantity = 1;
        it.extras = [];
        it.lineId = "prod_margarita::var_margarita_1";
        localStorage.setItem("pp-cart", JSON.stringify(c));
      });
      const variantOk = await db.menuVariant.findFirst({ where: { id: "var_margarita_1", productId: "prod_margarita" } });
      check(!!variantOk, "the local menu has var_margarita_1");
      await page.goto(`${BASE}/cart`);
      const notice = page.locator('[data-testid="minimum-order-shortfall"]');
      await notice.waitFor();
      check(/още 3\.35 €/.test(await notice.innerText()), "the remaining 3.35 € is named", await notice.innerText());
      check(!(await page.getByRole("link", { name: "Към поръчката" }).count()), "no link to checkout");
      await page.goto(`${BASE}/checkout`);
      await page.locator('[name="customerName"]').waitFor();
      check(await page.locator('[data-testid="place-order"]').isDisabled(), "the order button is disabled");
      await ctx.close();
    }

    // ── M ──
    console.log("M. an old basket with a product no longer on sale");
    {
      const { ctx, page } = await freshCheckout(browser, "en");
      await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem("pp-cart")!);
        const gone = JSON.parse(JSON.stringify(c.state.items[0]));
        gone.product = { ...gone.product, id: "prod_hot_dog_retired", slug: "hot-dog", name: "Hot dog", names: { bg: "Хотдог", en: "Hot dog" }, categoryId: "cat_starters" };
        gone.selectedVariant = undefined;
        gone.extras = [];
        gone.quantity = 1;
        gone.unitPrice = 4;
        gone.lineId = "prod_hot_dog_retired";
        c.state.items.push(gone);
        localStorage.setItem("pp-cart", JSON.stringify(c));
      });
      await page.goto(`${BASE}/en/cart`);
      await page.locator('[data-testid="cart-line-unavailable"]').waitFor({ timeout: 10_000 });
      check((await page.locator('[data-testid="cart-line-unavailable"]').count()) === 1, "only the retired line is flagged");
      check(!(await page.getByRole("link", { name: "Go to checkout" }).count()), "checkout is closed while it is there");
      await page.goto(`${BASE}/en/checkout`);
      await page.locator('[data-testid="checkout-unavailable"]').waitFor({ timeout: 10_000 });
      check(/Hot dog/.test(await page.locator('[data-testid="checkout-unavailable"]').innerText()), "checkout names it");
      check(await page.locator('[data-testid="place-order"]').isDisabled(), "the order button is disabled");
      await page.goto(`${BASE}/en/cart`);
      await page.getByRole("button", { name: "Remove Hot dog" }).click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="cart-line-unavailable"]'));
      check((await page.getByRole("link", { name: "Go to checkout" }).count()) === 1, "removed → checkout open again");
      await ctx.close();
    }

    // ── N ──
    console.log("N. signed in: the order button vs the header's Sign out");
    {
      const email = `n-e2e-${Date.now()}@example.test`;
      const password = `e2e-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      await db.user.create({ data: { email, passwordHash: await hashPassword(password), fullName: "Език Тест" } });
      try {
        const signIn = async (page: Page) => {
          await page.goto(`${BASE}/auth/login`);
          await page.locator('main [name="email"]').fill(email);
          await page.locator('main [name="password"]').fill(password);
          await page.locator('main button[type="submit"]').click();
          await page.waitForURL((u) => !u.pathname.includes("/auth/login"), { timeout: 20_000 });
        };
        const signedIn = (page: Page) =>
          page.evaluate(() => fetch("/api/auth/session").then((r) => r.json()).then((s) => !!s.signedIn));

        // 1. Ordering with the order button: one order, still signed in.
        {
          const { ctx, page } = await freshCheckout(browser, "en");
          await signIn(page);
          await page.goto(`${BASE}/en/checkout`);
          await page.locator('[data-testid="place-order"]').waitFor();
          const first = await page.evaluate(() => document.querySelector("form button[type=submit]")?.textContent?.trim());
          check(first === "Sign out", "signed in: the FIRST submit button in the page is the header's Sign out", first);
          const before = await ordersMade();
          await fill(page, "N1");
          await switchTo(page, "bg");
          await submit(page);
          check(await confirmed(page), "the order button orders and confirms");
          check((await ordersMade()) === before + 1, "exactly one order");
          check(await signedIn(page), "still signed in");
          await ctx.close();
        }

        // 2. The old report's exact click: the first submit button → Sign out.
        {
          const { ctx, page } = await freshCheckout(browser, "en");
          await signIn(page);
          await page.goto(`${BASE}/en/checkout`);
          await page.locator('[data-testid="place-order"]').waitFor();
          const before = await ordersMade();
          await fill(page, "N2");
          await switchTo(page, "bg");
          // As in the original run (it slept 3 s after the switch): the header
          // reloads its sign-in state after a language switch; once it has,
          // its Sign out button is the first submit button in the page.
          await page.locator("header form button[type=submit]").first().waitFor({ state: "attached" });
          const logBefore = serverLog()?.length ?? 0;
          await page.evaluate(() => (document.querySelector("form button[type=submit]") as HTMLButtonElement).click());
          await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
          check(true, 'the generic click lands on "/"');
          check((await ordersMade()) === before, "no order — exactly the old report");
          check(!(await signedIn(page)), "because it signed the customer out");
          const log = serverLog();
          if (log !== null) {
            await sleep(500);
            const fresh = (serverLog() ?? "").slice(logBefore);
            check(/\[auth\] signed out from \/checkout/.test(fresh), "the server log names the sign-out and its page", fresh.slice(0, 200));
          } else {
            console.log("    (E2E_SERVER_LOG not set — server-log checks skipped)");
          }
          await ctx.close();
        }
      } finally {
        await db.user.deleteMany({ where: { email } });
      }
    }

    // ── T ──
    console.log("T. an attempt left unfinished is reported by the next checkout page");
    if (SERVER_LOG) {
      const { ctx, page } = await freshCheckout(browser, "bg");
      await fill(page, "T");
      // The order request never gets an answer; the customer reloads.
      await page.route("**/*", (route) => (isOrderAction(route) && route.request().postData()?.includes("customerName") ? route.abort() : route.continue()));
      const logBefore = serverLog()!.length;
      await submit(page);
      await page.getByText(NETWORK_ERROR).waitFor({ timeout: 20_000 });
      await page.unroute("**/*");
      await page.reload();
      await page.locator('[name="customerName"]').waitFor();
      await sleep(1500);
      const fresh = serverLog()!.slice(logBefore);
      const line = fresh.split("\n").find((l) => l.startsWith("[checkout-trace]")) ?? "";
      check(/id=[a-z0-9]{12} version=\S+ locale=bg path=\/checkout stages=click@\d+,sent@\d+,failed@\d+/.test(line), "one [checkout-trace] line: click, sent, failed", line || fresh.slice(0, 300));
      check(!/Език Тест|0888111444|example\.test|Тестова/.test(line), "the line carries no personal data");
      await ctx.close();
    } else {
      console.log("    (E2E_SERVER_LOG not set — skipped)");
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
