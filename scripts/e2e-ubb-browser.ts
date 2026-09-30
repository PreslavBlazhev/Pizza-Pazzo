/**
 * BROWSER end-to-end check of the UBB virtual-POS requirements that live in
 * the UI (docs/UBB-COMPLIANCE.md, docs/UBB-VERIFICATION.md). Real Chrome via
 * playwright-core (the browser installed on this machine; nothing is
 * downloaded), against a running LOCAL server and its local database.
 *
 *   1. every legal/contact page answers 200 in BG and EN without an account,
 *      has no raw i18n keys, no horizontal overflow on a phone and a desktop;
 *   2. the footer and the checkout link to every document, and following a
 *      checkout link (new tab) keeps the cart and everything typed;
 *   3. checkout: the three confirmations start unticked, are keyboard
 *      operable, a submit without them is stopped in the UI; a submit whose
 *      checkbox was unticked behind React's back (the UI bypassed) is refused
 *      by the SERVER; a valid order stores the accepted versions and time;
 *   4. the final total is shown right before the button, which says that the
 *      order is binding;
 *   5. the contacts page sends nothing to Google until "Show the map".
 *
 * Mock/local only — NOT a bank test. Cash orders only; they are deleted at
 * the end. Start the server WITHOUT the Resend key so nothing is e-mailed:
 *   RESEND_API_KEY= npm run dev
 *   npm run e2e:ubb              (E2E_HEADED=1 to watch)
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { getAppEnv } from "@/lib/app-env";
import { LEGAL_VERSIONS } from "@/content/legal/versions";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = process.env.E2E_SHOTS ?? path.join(process.cwd(), "docs", "ubb-evidence", "screenshots");

if (getAppEnv() === "production") {
  console.error("Refusing to run against APP_ENV=production.");
  process.exit(1);
}

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
} as const;

const LEGAL_PAGES = ["/terms", "/refunds", "/delivery", "/payment-methods", "/privacy", "/cookies", "/contacts"];

/** Visible text that looks like an untranslated message key, e.g. "checkout.errors.X". */
const RAW_KEY = /\b(checkout|legal|contacts|footer|payment|product|common|hours|meta)\.[a-zA-Z]+(\.[A-Za-z_]+)?\b/;

async function noOverflow(page: Page): Promise<{ ok: boolean; detail: string }> {
  return page.evaluate(() => {
    const el = document.documentElement;
    const over = el.scrollWidth - el.clientWidth;
    return { ok: over <= 1, detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}` };
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function addPizzaToCart(page: Page) {
  const product = await db.menuProduct.findFirstOrThrow({
    where: { isAvailable: true, variants: { some: {} } },
    orderBy: { sortOrder: "asc" },
    select: { slug: true },
  });
  await page.goto(`${BASE}/product/${product.slug}`);
  await page.getByRole("button", { name: "Добави в количката" }).first().click();
  await page.waitForFunction(() => (localStorage.getItem("pp-cart") ?? "").includes("productId") || (localStorage.getItem("pp-cart") ?? "").includes('"items":[{'));
}

async function fillContact(page: Page, tag: string) {
  await page.locator('[name="customerName"]').fill("УББ Тест");
  await page.locator('[name="customerPhone"]').fill("0888111333");
  await page.locator('[name="customerEmail"]').fill("ubb-e2e@example.test");
  await page.locator('[name="deliveryAddress"]').fill(`ул. Тестова 7 (${tag})`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const createdBefore = await db.order.count();
  const browser: Browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });

  try {
    // ── 1. Legal and contact pages, BG + EN, phone + desktop, no account ──
    console.log("1. Legal/contact pages without an account");
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      for (const locale of ["bg", "en"] as const) {
        for (const p of LEGAL_PAGES) {
          const url = `${BASE}${locale === "en" ? "/en" : ""}${p}`;
          const res = await page.goto(url);
          const status = res?.status() ?? 0;
          const text = await page.locator("main").innerText();
          const overflow = await noOverflow(page);
          check(status === 200, `${vpName} ${locale} ${p} → 200`, `got ${status}`);
          check(!RAW_KEY.test(text), `${vpName} ${locale} ${p}: no raw i18n key`, text.match(RAW_KEY)?.[0]);
          check(overflow.ok, `${vpName} ${locale} ${p}: no horizontal overflow`, overflow.detail);
          if (p !== "/contacts") {
            const version = await page.getByText(locale === "en" ? /Version \d{4}-\d{2}-\d{2}/ : /Версия \d{4}-\d{2}-\d{2}/).count();
            check(version > 0, `${vpName} ${locale} ${p}: shows its version`);
          }
          await shot(page, `${vpName}-${locale}${p.replace(/\//g, "-")}`);
        }
      }
      await ctx.close();
    }

    // Merchant identity where the bank looks for it.
    {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/contacts`);
      const main = await page.locator("main").innerText();
      check(main.includes("203300275") && main.includes("BG203300275"), "contacts: ЕИК and ДДС № shown");
      check(main.includes("152700478") && main.includes("101-7892/16.04.2015"), "contacts: BFSA registration shown");
      check(main.includes("Димитър Константинов") && main.includes("Георги Кочев"), "contacts: seat and restaurant addresses kept apart");
      const tel = await page.locator('a[href^="tel:"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      const mail = await page.locator('a[href^="mailto:"]').count();
      check(tel.includes("tel:+359882484777") && tel.includes("tel:+35964801999"), "contacts: both phones dialable (tel:)", JSON.stringify(tel));
      check(mail > 0, "contacts: e-mail is a mailto: link");
      const footer = await page.locator("footer").innerText();
      check(footer.includes("203300275") && footer.includes("„ПИЦА ПАЦО“ ЕООД"), "footer: registered name + ЕИК");
      const footerLinks = await page.locator("footer a").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
      for (const p of LEGAL_PAGES) check(footerLinks.includes(p), `footer links to ${p}`);
      await page.goto(`${BASE}/en/contacts`);
      const enFooterLinks = await page.locator("footer a").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
      for (const p of LEGAL_PAGES) check(enFooterLinks.includes(`/en${p}`), `EN footer links to /en${p}`);
      await ctx.close();
    }

    // ── 5. The map: nothing goes to Google before the click ──
    console.log("5. Google map loads only on request");
    {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile });
      const page = await ctx.newPage();
      const google: string[] = [];
      page.on("request", (r) => {
        if (/google\.|gstatic\.|googleapis\./.test(new URL(r.url()).hostname)) google.push(r.url());
      });
      await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle" });
      check(google.length === 0, "no request to Google on page load", google[0]);
      const cookiesBefore = (await ctx.cookies()).map((c) => `${c.name}@${c.domain}`);
      check(cookiesBefore.every((c) => !/google/.test(c)), "no Google cookie before the click", cookiesBefore.join(","));
      await page.getByRole("button", { name: "Покажи картата" }).click();
      await page.waitForSelector("iframe[src*='google.com/maps']");
      await page.waitForTimeout(1500);
      check(google.length > 0, "the map loads after pressing the button");
      console.log(`    first-party cookies seen on a plain visit: ${cookiesBefore.filter((c) => !/google/.test(c)).join(", ") || "none"}`);
      await ctx.close();
    }

    // ── 2–4. Checkout ──
    console.log("2–4. Checkout: confirmations, links, final total, server enforcement");
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({ viewport, locale: "bg-BG" });
      const page = await ctx.newPage();
      await addPizzaToCart(page);
      await page.goto(`${BASE}/checkout`);
      await fillContact(page, vpName);

      for (const name of ["consentTerms", "consentRefunds", "consentPrivacy"]) {
        check(!(await page.locator(`input[name="${name}"]`).isChecked()), `${vpName}: ${name} starts unticked`);
      }
      check(
        (await page.locator('[name="deliveryCity"]').inputValue()) === "Плевен" &&
          (await page.locator('[name="deliveryCity"]').getAttribute("readonly")) !== null,
        `${vpName}: delivery town is fixed to Плевен and stated before ordering`
      );
      const overflow = await noOverflow(page);
      check(overflow.ok, `${vpName}: checkout has no horizontal overflow`, overflow.detail);

      // Final total directly above a binding button.
      const totalBox = page.getByTestId("checkout-final-total");
      check(await totalBox.isVisible(), `${vpName}: final total shown before the button`);
      const submit = page.getByRole("button", { name: "Поръчка със задължение за плащане" });
      check(await submit.isVisible(), `${vpName}: the button says the order is binding`);
      const boxBottom = (await totalBox.boundingBox())!.y + (await totalBox.boundingBox())!.height;
      const btnTop = (await submit.boundingBox())!.y;
      check(btnTop >= boxBottom && btnTop - boxBottom < 120, `${vpName}: total sits immediately above the button`);

      // Submit without confirmations → stopped in the UI, no order.
      const before = await db.order.count();
      await submit.click();
      const popup = page.getByRole("alert").filter({ hasText: "Попълнете задължителните полета" });
      await popup.waitFor();
      const popupText = await popup.innerText();
      check(
        popupText.includes("Приемане на Общите условия") && popupText.includes("Запознаване с Политиката за поверителност"),
        `${vpName}: the popup names the missing confirmations`
      );
      check((await db.order.count()) === before, `${vpName}: no order without confirmations (UI)`);
      await shot(page, `${vpName}-bg-checkout-missing-confirmations`);

      // The document links: new tab, cart and typed data survive.
      const [docTab] = await Promise.all([
        ctx.waitForEvent("page"),
        page.locator("label[for='consentRefunds'] a").click(),
      ]);
      await docTab.waitForLoadState();
      check(new URL(docTab.url()).pathname === "/refunds", `${vpName}: the refunds link opens /refunds in a new tab`);
      check((await docTab.locator("h1").innerText()).length > 0, `${vpName}: the document renders`);
      await docTab.close();
      check(
        (await page.locator('[name="deliveryAddress"]').inputValue()).includes(vpName),
        `${vpName}: typed address kept after opening a document`
      );
      const cartLen = await page.evaluate(() => JSON.parse(localStorage.getItem("pp-cart") ?? "{}").state?.items?.length ?? 0);
      check(cartLen > 0, `${vpName}: cart kept after opening a document`);

      // Keyboard: focus each checkbox and tick it with the space bar.
      for (const name of ["consentTerms", "consentRefunds", "consentPrivacy"]) {
        await page.locator(`input[name="${name}"]`).focus();
        await page.keyboard.press("Space");
        check(await page.locator(`input[name="${name}"]`).isChecked(), `${vpName}: ${name} ticked with the keyboard`);
      }
      // Tab order reaches the links inside the labels too.
      await page.locator('input[name="consentTerms"]').focus();
      await page.keyboard.press("Tab");
      const focusedHref = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href"));
      check(focusedHref === "/terms", `${vpName}: Tab moves from the checkbox to its document link`, String(focusedHref));

      if (vpName === "mobile") {
        // UI BYPASS: React state says ticked, the posted form says not.
        // The server must refuse on its own.
        await page.evaluate(() => {
          (document.querySelector('input[name="consentPrivacy"]') as HTMLInputElement).checked = false;
        });
        const b2 = await db.order.count();
        await submit.click();
        await page.getByText("Потвърдете това, за да изпратите поръчката.").first().waitFor({ timeout: 20_000 });
        check((await db.order.count()) === b2, "server refuses a request whose privacy confirmation was removed (UI bypassed)");
        await shot(page, "mobile-bg-checkout-server-refusal");
        await page.locator('input[name="consentPrivacy"]').uncheck().catch(() => {});
        await page.locator('input[name="consentPrivacy"]').check();
      }

      // A valid cash order.
      await shot(page, `${vpName}-bg-checkout-ready`);
      const t0 = Date.now();
      await submit.click();
      await page.waitForURL(/\/order-success/, { timeout: 30_000 });
      const n = Number(new URL(page.url()).searchParams.get("n"));
      const row = await db.order.findUniqueOrThrow({ where: { orderNumber: n } });
      check(row.consentTermsVersion === LEGAL_VERSIONS.terms, `${vpName}: order #${n} stores the Terms version`);
      check(row.consentRefundsVersion === LEGAL_VERSIONS.refunds, `${vpName}: order #${n} stores the Cancellation terms version`);
      check(row.consentPrivacyVersion === LEGAL_VERSIONS.privacy, `${vpName}: order #${n} stores the Privacy version`);
      check(!!row.consentRecordedAt && Math.abs(row.consentRecordedAt.getTime() - t0) < 60_000, `${vpName}: order #${n} stores the server time`);
      check(row.deliveryCity === "Плевен" && row.paymentMethod === "CASH_ON_DELIVERY", `${vpName}: cash order to Pleven`);
      await shot(page, `${vpName}-bg-order-success`);
      await ctx.close();
    }

    // English checkout: the refusal is in English.
    {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await ctx.newPage();
      await addPizzaToCart(page);
      await page.goto(`${BASE}/en/checkout`);
      await page.locator('[name="customerName"]').fill("UBB Test");
      await page.locator('[name="customerPhone"]').fill("0888111333");
      await page.locator('[name="customerEmail"]').fill("ubb-e2e@example.test");
      await page.locator('[name="deliveryAddress"]').fill("7 Test St (en)");
      for (const name of ["consentTerms", "consentRefunds", "consentPrivacy"]) await page.locator(`input[name="${name}"]`).check();
      await page.evaluate(() => {
        (document.querySelector('input[name="consentTerms"]') as HTMLInputElement).checked = false;
      });
      await page.getByRole("button", { name: "Order with obligation to pay" }).click();
      await page.getByText("Please confirm this to send the order.").first().waitFor({ timeout: 20_000 });
      check(true, "EN: the server's refusal is shown in English");
      check(
        await page.getByRole("group", { name: "Confirmations (required)" }).isVisible(),
        "EN: the confirmations are in English"
      );
      await shot(page, "desktop-en-checkout-server-refusal");
      await ctx.close();
    }
  } finally {
    await browser.close();
    // Clean up every order this run created (cash only, local DB).
    const mine = await db.order.findMany({
      where: { customerEmail: "ubb-e2e@example.test" },
      select: { id: true, orderNumber: true },
    });
    await db.order.deleteMany({ where: { id: { in: mine.map((o) => o.id) } } });
    console.log(`\ncleaned up ${mine.length} test order(s): ${mine.map((o) => `#${o.orderNumber}`).join(", ") || "—"}`);
    check((await db.order.count()) === createdBefore, "database back to its order count");
    await db.$disconnect();
  }

  console.log(`\nscreenshots: ${SHOTS}`);
  if (failures > 0) {
    console.error(`\nE2E UBB FAILED (${failures})`);
    process.exit(1);
  }
  console.log("\nE2E UBB OK");
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
