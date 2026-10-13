/**
 * Browser check of the owner's changes of 2026-10-13, against a RUNNING
 * server (default http://localhost:3000; E2E_BASE_URL to change):
 *
 *   - homepage: the big bold phone under the logo (tel: link), "Безплатна
 *     доставка" / "Free delivery"
 *   - header: logo and phone on ONE line, nothing overlapping, at 360–430 px
 *   - menu: the two promo boards (the homepage's components) directly above
 *     the category bar, side by side on a phone; no add-on categories
 *   - pizza: 39 concrete toppings under two headings, prices per size,
 *     selections kept on a 30 ⇄ 40 cm change, the total re-computed
 *   - burger: its own add-ons, no pizza toppings
 *   - add-on pages and categories answer 404
 *   - an old basket (generic "Месна добавка", a topping on its own) is
 *     flagged and the way to checkout stays closed
 *
 * Read-only: places no order, sends no e-mail. Screenshots go to
 * E2E_SHOTS (a folder) when set.
 *
 *   npm run e2e:toppings-ui
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = process.env.E2E_SHOTS ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(ok: boolean, label: string, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

async function shot(page: Page, name: string, fullPage = false) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
}

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

type Locale = "bg" | "en";
const prefix = (l: Locale) => (l === "en" ? "/en" : "");

async function homepage(browser: Browser, locale: Locale, width: number) {
  console.log(`Homepage (${locale}, ${width}px)`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${prefix(locale)}/`);
  await page.waitForLoadState("networkidle");
  const phone = page.locator('main a[href^="tel:"]').first();
  check((await phone.getAttribute("href")) === "tel:+35964801999", "phone under the logo dials +359 64 801 999");
  const style = await phone.evaluate((el) => {
    const s = getComputedStyle(el);
    return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight) };
  });
  check(style.size >= 28 && style.weight >= 700, "the phone is large and bold", style);
  const badge = locale === "bg" ? "Безплатна доставка" : "Free delivery";
  check(await page.getByText(badge, { exact: true }).first().isVisible(), `badge reads “${badge}”`);
  check((await page.getByText(/Доставка на пици в Плевен|Pizza delivery in Pleven/).count()) === 0, "the old badge text is gone");
  check(await noHorizontalScroll(page), "no horizontal scroll");
  await shot(page, `home-${locale}-${width}`);
  await ctx.close();
}

async function menu(browser: Browser, locale: Locale, width: number) {
  console.log(`Menu (${locale}, ${width}px)`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${prefix(locale)}/menu`);
  await page.waitForLoadState("networkidle");

  // Header: logo + phone on one row, no overlap with the right-hand controls.
  const header = await page.evaluate(() => {
    const h = document.querySelector("header")!;
    const logo = h.querySelector('img[alt="Pizza Pazzo"]')!.getBoundingClientRect();
    const tel = h.querySelector('a[href^="tel:"]')!;
    const phone = tel.getBoundingClientRect();
    const right = [...h.querySelectorAll('a[href$="/cart"], button')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.left > phone.left);
    return {
      centreGap: Math.abs(logo.top + logo.height / 2 - (phone.top + phone.height / 2)),
      sameRow: phone.left >= logo.right,
      overlap: right.some((r) => r.left < phone.right - 0.5),
      fontPx: parseFloat(getComputedStyle(tel).fontSize),
      inView: phone.right <= window.innerWidth,
    };
  });
  check(header.sameRow && header.centreGap <= 4, "header: phone beside the logo, centred", header);
  check(!header.overlap && header.inView, "header: phone overlaps nothing and is not cut off", header);
  check(header.fontPx >= 15, "header: phone at least 15px", header.fontPx);

  // Promo boards: both, side by side, then the category bar.
  const layout = await page.evaluate(() => {
    const boards = [...document.querySelectorAll('main [data-testid="promo-board"]')];
    const nav = document.querySelector("main nav")!.getBoundingClientRect();
    const r = boards.map((b) => b.getBoundingClientRect());
    return {
      boards: r.length,
      sideBySide: r.length === 2 && Math.abs(r[0].top - r[1].top) < 1 && r[1].left >= r[0].right,
      gapToNav: r.length ? nav.top - Math.max(...r.map((x) => x.bottom)) : -1,
      inView: r.every((x) => x.left >= 0 && x.right <= window.innerWidth),
    };
  });
  check(layout.boards === 2 && layout.sideBySide, "two promo boards side by side", layout);
  check(layout.gapToNav >= 0 && layout.gapToNav <= 24, "the category bar follows right under the boards", layout.gapToNav);
  check(layout.inView, "boards fit the screen", layout);
  // Only the screen-reader h1 may still carry the title.
  const introLeft = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter(
      (el) =>
        !el.closest(".sr-only") &&
        el.children.length === 0 &&
        /Дигитално меню|Digital menu|Изберете от нашите пици|Цените са посочени в евро/.test(el.textContent ?? "")
    ).length
  );
  check(introLeft === 0, "the old intro block is gone", introLeft);
  const navText = await page.locator("main nav").innerText();
  check(!/добавки|toppings|add-ons/i.test(navText), "no add-on categories in the bar", navText);
  check(await noHorizontalScroll(page), "no horizontal scroll");
  await shot(page, `menu-${locale}-${width}`);

  // The bar still scrolls sideways and jumps to a category.
  const last = page.locator("main nav a").last();
  await last.click();
  await page.waitForTimeout(900);
  check((await last.getAttribute("aria-current")) === "true", "a category tab still selects and scrolls");
  await ctx.close();
}

async function pizza(browser: Browser, locale: Locale, width: number) {
  console.log(`Pizza toppings (${locale}, ${width}px)`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${prefix(locale)}/product/margarita`);
  await page.waitForLoadState("networkidle");
  const en = locale === "en";
  await page.getByRole("button", { name: en ? /Choose add-ons|Choose extras|add-ons/i : /Изберете добавки/ }).first().click();
  const panel = page.locator('[data-testid="topping-group"]');
  check((await panel.count()) === 2, "two topping groups", await panel.count());
  const rows = await page.locator('[data-testid="topping-group"] button[aria-pressed]').count();
  check(rows === 39, "39 concrete toppings offered", rows);
  check(
    (await page.getByText(en ? /Meat add-on|Vegetable add-on/ : /Месна добавка|Зеленчукова добавка/).count()) === 0,
    "no generic options left"
  );
  const mushrooms = page.getByRole("button", { name: en ? /^Mushrooms/ : /^Гъби/ });
  const bacon = page.getByRole("button", { name: en ? /^Bacon/ : /^Бекон/ });
  check((await mushrooms.innerText()).includes("2.05"), "mushrooms +2.05 € at 30 cm", await mushrooms.innerText());
  check((await bacon.innerText()).includes("2.56"), "bacon +2.56 € at 30 cm", await bacon.innerText());
  await mushrooms.click();
  await bacon.click();
  await shot(page, `toppings-${locale}-${width}-30`);
  const total = async () => (await page.locator('[data-testid="product-total"]').innerText()).match(/(\d+\.\d{2})/)?.[1];
  check((await total()) === "11.26", "30 cm total 6.65 + 2.05 + 2.56 = 11.26", await total());

  await page.getByRole("button", { name: /^40 (см|cm)/ }).first().click();
  // The open list may have closed on that click — open it again if needed.
  if (!(await mushrooms.isVisible())) {
    await page.getByRole("button", { name: en ? /add-ons/i : /Изберете добавки/ }).first().click();
  }
  check((await mushrooms.getAttribute("aria-pressed")) === "true" && (await bacon.getAttribute("aria-pressed")) === "true", "selection kept after 30 → 40 cm");
  check((await mushrooms.innerText()).includes("2.56") && (await bacon.innerText()).includes("3.07"), "prices follow 40 cm (2.56 / 3.07)");
  check((await total()) === "15.86", "40 cm total 10.23 + 2.56 + 3.07 = 15.86", await total());
  await page.getByRole("button", { name: en ? /Increase quantity/i : /Увеличи количеството/ }).last().click();
  check((await total()) === "31.72", "2 pizzas: 15.86 × 2 = 31.72", await total());
  check(await noHorizontalScroll(page), "no horizontal scroll");
  await shot(page, `toppings-${locale}-${width}-40`);
  await ctx.close();
}

async function burgerAndGone(browser: Browser) {
  console.log("Burger add-ons and add-on pages");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/product/pileshki`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Изберете добавки/ }).first().click();
  check(await page.getByRole("button", { name: /^Чедър/ }).first().isVisible(), "burger offers its own add-ons (Чедър)");
  check((await page.locator('[data-testid="topping-group"]').count()) === 0, "no pizza topping groups on a burger");
  for (const url of ["/menu/pizza-addons", "/menu/burger-addons", "/product/topping-gabi", "/product/zelenchukovi", "/product/chedar", "/en/product/topping-gabi"]) {
    const res = await page.goto(`${BASE}${url}`);
    check(res?.status() === 404, `${url} → 404`, res?.status());
  }
  await ctx.close();
}

async function oldBasket(browser: Browser, locale: Locale) {
  console.log(`Old basket (${locale})`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${prefix(locale)}/delivery`);
  const v30 = { id: "var_margarita_1", name: "30 см", names: { bg: "30 см", en: "30 cm" }, priceEur: 6.65 };
  const product = (id: string, name: string, categoryId: string, priceEur: number, variants?: unknown[]) => ({
    id, name, names: { bg: name, en: name }, slug: id, description: "", categoryId, priceEur,
    imageUrl: "/images/products/placeholder-pizza.svg", allergens: [], isAvailable: true, sortOrder: 0, variants,
  });
  const basket = JSON.stringify({
    version: 2,
    state: {
      items: [
        {
          lineId: "prod_margarita::var_margarita_1::meat_addon@prod_mesni_mlechni_ribnix1",
          product: product("prod_margarita", "Маргарита", "cat_pizzas_standard", 6.65, [v30]),
          selectedVariant: v30,
          extras: [{ key: "meat_addon", sourceProductId: "prod_mesni_mlechni_ribni", quantity: 1,
            display: { nameBg: "Месна добавка", nameEn: "Meat add-on", unitPriceEur: 2.56 } }],
          quantity: 2, unitPrice: 6.65,
        },
        {
          lineId: "prod_zelenchukovi::var_zelenchukovi_1",
          product: product("prod_zelenchukovi", "Зеленчукови", "cat_pizza_addons", 2.05),
          extras: [], quantity: 1, unitPrice: 2.05,
        },
      ],
    },
  });
  // A plain string goes in: tsx helpers must not leak into the page.
  await page.evaluate((value) => localStorage.setItem("pp-cart", value), basket);
  await page.goto(`${BASE}${prefix(locale)}/cart`);
  await page.waitForLoadState("networkidle");
  check(await page.locator('[data-testid="cart-line-extras-outdated"]').isVisible(), "generic «Месна добавка» line asks to choose again");
  check(await page.locator('[data-testid="cart-line-addon-only"]').isVisible(), "a topping on its own is flagged");
  check((await page.locator('a[href$="/checkout"]').count()) === 0, "the way to checkout stays closed");
  await shot(page, `old-basket-${locale}`, true);

  // "Choose toppings" opens the pizza with the generic choice dropped.
  await page.getByRole("link", { name: locale === "en" ? /Choose toppings|Edit/ : /Избери добавките|Промени/ }).first().click();
  await page.waitForLoadState("networkidle");
  // The notice appears once the basket has been read after hydration.
  const notice = await page
    .locator('[data-testid="extras-outdated-notice"]')
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true, () => false);
  check(notice, "the product page explains the re-choice");
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  try {
    for (const locale of ["bg", "en"] as const) {
      for (const width of [360, 390, 430, 1280]) {
        await homepage(browser, locale, width);
        await menu(browser, locale, width);
      }
      for (const width of [360, 1280]) await pizza(browser, locale, width);
      await oldBasket(browser, locale);
    }
    await burgerAndGone(browser);
  } finally {
    await browser.close();
  }
  console.log(failures === 0 ? "\nE2E TOPPINGS UI OK" : `\nE2E TOPPINGS UI FAILED — ${failures} problem(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
