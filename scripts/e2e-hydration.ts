/**
 * BROWSER check for hydration mismatches (React #418 and its relatives) on
 * the public pages — real Chrome via playwright-core, a fresh profile per
 * context (no extensions), against a running LOCAL server.
 *
 * Covers BG and EN, an empty basket and a saved one (with extras, and with a
 * product no longer on sale), direct opening, reload and client-side
 * navigation, several visitor timezones and a controlled browser clock around
 * the opening-hours and day boundaries.
 *
 * SLOW NETWORK (the case that found React #418): at ~20 KB/s the client code
 * of some components arrives while hydration is under way; a host element
 * whose child is still loading suspends and is replayed. Before the patch in
 * patches/next+15.5.20.patch this threw #418 on 8 of 8 loads of /menu.
 *
 * Fails on ANY page error and on any console message that looks like a
 * hydration problem. Against `next dev` the console carries React's full
 * diff, which this script prints.
 *
 *   npx next dev -p 3200            (or: npm run build && npm run start)
 *   E2E_BASE_URL=http://localhost:3200 npm run e2e:hydration
 *
 * Read-only: it never submits a form.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const QUICK = !!process.env.E2E_QUICK;

const HYDRATION =
  /hydrat|did not match|didn't match|Minified React error #(418|419|421|422|423|425)|server rendered (HTML|text)|Text content does not match/i;

let failures = 0;
let loads = 0;
const findings: string[] = [];

function report(where: string, kind: string, text: string) {
  failures++;
  const line = `✗ ${where} — ${kind}: ${text}`;
  findings.push(line);
  console.log(line.slice(0, 4000));
}

/** Attach listeners that record every hydration-looking message on this page. */
function watch(page: Page, label: () => string) {
  page.on("console", (m) => {
    const text = m.text();
    if ((m.type() === "error" || m.type() === "warning") && HYDRATION.test(text)) {
      report(label(), `console.${m.type()}`, text);
    }
  });
  page.on("pageerror", (e) => report(label(), "pageerror", `${e.message}\n${e.stack ?? ""}`.slice(0, 3000)));
}

/** A basket as the product page saves it: pizza with extras + a drink, and optionally a retired product. */
async function seedBasket(page: Page, locale: "bg" | "en", withRetired: boolean) {
  // Written directly (the shape the store persists), so the sweep also works
  // while the shop is closed and the "Add" button is blocked by the notice.
  const prefix = locale === "en" ? "/en" : "";
  await page.goto(`${BASE}${prefix}/delivery`);
  await page.evaluate((retired) => {
    const v30 = { id: "var_moyata_patso_1", name: "30 см", names: { bg: "30 см", en: "30 cm" }, priceEur: 9.71 };
    const c = {
      version: 2,
      state: {
        items: [
          {
            lineId: "prod_moyata_patso::var_moyata_patso_1::free_meat_topping@prod_mesni_mlechni_ribnix1",
            product: {
              id: "prod_moyata_patso",
              name: "Моята Пацо",
              names: { bg: "Моята Пацо", en: "My Pazzo" },
              slug: "moyata-patso",
              description: "",
              categoryId: "cat_pizzas_standard",
              priceEur: 9.71,
              imageUrl: "/images/products/placeholder-pizza.svg",
              allergens: [],
              isAvailable: true,
              sortOrder: 0,
              variants: [v30],
            },
            selectedVariant: v30,
            extras: [
              {
                key: "free_meat_topping",
                sourceProductId: "prod_mesni_mlechni_ribni",
                quantity: 1,
                display: { nameBg: "Безплатна добавка: месна", nameEn: "Free topping: meat", unitPriceEur: 0 },
              },
            ],
            quantity: 2,
            unitPrice: 9.71,
          },
        ] as unknown[],
      },
    };
    if (retired) {
      const x = JSON.parse(JSON.stringify(c.state.items[0])) as Record<string, unknown> & { product: object };
      x.product = { ...x.product, id: "prod_hydration_retired", name: "Retired", names: { bg: "Спрян", en: "Retired" }, categoryId: "cat_starters" };
      x.selectedVariant = undefined;
      x.extras = [];
      x.quantity = 1;
      x.unitPrice = 4;
      x.lineId = "prod_hydration_retired";
      c.state.items.push(x);
    }
    localStorage.setItem("pp-cart", JSON.stringify(c));
  }, withRetired);
}

const PAGES = [
  "/",
  "/menu",
  "/menu/cat_pizzas_standard",
  "/popular",
  "/product/moyata-patso",
  "/product/peperoni-maks?edit=x",
  "/cart",
  "/checkout",
  "/gallery",
  "/delivery",
  "/contacts",
  "/reviews",
  "/terms",
  "/privacy",
  "/refunds",
  "/cookies",
  "/payment-methods",
  "/order-success",
  "/order-success?n=1",
  "/auth/login",
  "/auth/register",
];

async function settle(page: Page) {
  await page.waitForLoadState("load");
  // Hydration and the first effects (store status, basket checks).
  await page.waitForTimeout(QUICK ? 400 : 900);
}

async function sweep(browser: Browser, opts: {
  locale: "bg" | "en";
  basket: "empty" | "saved" | "retired";
  timezoneId?: string;
  clock?: string; // ISO instant the BROWSER believes it is
  viewport?: { width: number; height: number };
}) {
  const tag = `${opts.locale}/${opts.basket}${opts.timezoneId ? `/${opts.timezoneId}` : ""}${opts.clock ? `/@${opts.clock}` : ""}${opts.viewport ? `/${opts.viewport.width}px` : ""}`;
  console.log(`\n== ${tag}`);
  const ctx: BrowserContext = await browser.newContext({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    timezoneId: opts.timezoneId,
    locale: opts.locale === "en" ? "en-GB" : "bg-BG",
  });
  const page = await ctx.newPage();
  if (opts.clock) await page.clock.install({ time: new Date(opts.clock) });
  let where = tag;
  watch(page, () => `${where} ${page.url().replace(BASE, "")}`);

  if (opts.basket !== "empty") await seedBasket(page, opts.locale, opts.basket === "retired");

  const prefix = opts.locale === "en" ? "/en" : "";
  const pages = QUICK ? PAGES.slice(0, 8) : PAGES;

  // Direct opening, then a reload of each page.
  for (const p of pages) {
    where = `${tag} direct`;
    await page.goto(`${BASE}${prefix}${p === "/" && prefix ? "" : p}`);
    await settle(page);
    loads++;
    where = `${tag} reload`;
    await page.reload();
    await settle(page);
    loads++;
  }

  // Client-side navigation through the header and the basket.
  where = `${tag} navigate`;
  await page.goto(`${BASE}${prefix || "/"}`);
  await settle(page);
  for (const href of ["/menu", "/gallery", "/cart", "/delivery", "/contacts", "/menu"]) {
    const link = page.locator(`a[href="${prefix}${href}"]:visible`).first();
    if (await link.count()) {
      // dispatchEvent: the closed-shop notice covers the page outside hours.
      await link.dispatchEvent("click");
      await page.waitForURL((u) => u.pathname === `${prefix}${href}`, { timeout: 15_000 }).catch(() => {});
      await settle(page);
      loads++;
    }
  }
  // The language switch, both ways.
  const other = opts.locale === "en" ? "bg" : "en-GB";
  const sw = page.locator(`button[lang="${other}"]:visible`).first();
  if (await sw.count()) {
    await sw.dispatchEvent("click");
    await settle(page);
    loads++;
  }
  await ctx.close();
}

/** Pages loaded over a throttled connection (CDP), watched the same way. */
async function slowSweep(browser: Browser, opts: { locale: "bg" | "en"; basket: boolean }) {
  const tag = `slow-network/${opts.locale}/${opts.basket ? "saved" : "empty"}`;
  console.log(`
== ${tag}`);
  const prefix = opts.locale === "en" ? "/en" : "";
  for (const p of ["/menu", "/", "/checkout", "/gallery"]) {
    const ctx = await browser.newContext({ locale: opts.locale === "en" ? "en-GB" : "bg-BG" });
    const page = await ctx.newPage();
    if (opts.basket) await seedBasket(page, opts.locale, false);
    watch(page, () => `${tag} ${page.url().replace(BASE, "")}`);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 300,
      downloadThroughput: 20 * 1024,
      uploadThroughput: 20 * 1024,
    });
    await page.goto(`${BASE}${prefix}${p === "/" && prefix ? "" : p}`, { timeout: 300_000 });
    await page.waitForTimeout(1500);
    loads++;
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  try {
    for (const locale of ["bg", "en"] as const) {
      for (const basket of ["empty", "saved", "retired"] as const) {
        await sweep(browser, { locale, basket });
      }
    }
    for (const locale of ["bg", "en"] as const) {
      await slowSweep(browser, { locale, basket: locale === "en" });
    }
    if (!QUICK) {
      // Mobile, and visitors whose clock/zone differ from the restaurant's.
      await sweep(browser, { locale: "bg", basket: "saved", viewport: { width: 390, height: 844 } });
      await sweep(browser, { locale: "en", basket: "saved", timezoneId: "America/Los_Angeles" });
      await sweep(browser, { locale: "en", basket: "saved", timezoneId: "Asia/Tokyo" });
      // Browser clock at the edges: just before closing, just before
      // midnight in Sofia, just before opening, and a wildly wrong clock.
      for (const clock of ["2026-10-13T19:29:58Z", "2026-10-13T20:59:58Z", "2026-10-14T07:59:58Z", "2031-01-01T00:00:00Z"]) {
        await sweep(browser, { locale: "bg", basket: "saved", clock });
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${loads} page loads checked`);
  if (failures > 0) {
    console.log(`\nHYDRATION CHECK FAILED — ${failures} finding(s)`);
    process.exit(1);
  }
  console.log("\nHYDRATION CHECK OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
