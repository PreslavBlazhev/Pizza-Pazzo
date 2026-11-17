/**
 * Browser check of the crusts (борд) on a pizza whose size label carries the
 * weight ("30 см / 400g" — Маргарита, Кашкавалина in production), against a
 * RUNNING server (default http://localhost:3000; E2E_BASE_URL to change).
 * Point the server at a database where those labels exist.
 *
 *   - 30 and 40 cm: all four crusts selectable, priced 3.58 / 4.60 €
 *   - pick / un-pick / swap a crust; the total follows
 *   - 30 ⇄ 40 cm with a crust picked: kept and re-priced
 *   - added to the basket: the basket and the checkout page show the crust
 *
 * Read-only: places no order. E2E_PRODUCT=<slug> picks the pizza (margarita).
 *
 *   npm run e2e:crust-ui
 */
import { chromium, type Page } from "playwright-core";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SLUG = process.env.E2E_PRODUCT ?? "margarita";

let failures = 0;
function check(ok: boolean, label: string, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const CRUSTS = ["Кашкавален борд", "Филаделфия борд", "Кренвирш борд", "Пеперони борд"];
const eur = (s: string) => Number((s.match(/(\d+[.,]\d{2})\s*€/) ?? [])[1]?.replace(",", "."));

/** The add-ons panel closes on an outside click (a size change) — reopen it. */
async function openAddons(page: Page) {
  const toggle = page.locator("main button[aria-expanded]").filter({ hasText: /добавки/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

const crustRow = (page: Page, name: string) =>
  page.locator("main button[aria-pressed]").filter({ hasText: name });
const sizeButton = (page: Page, size: 30 | 40) =>
  page.locator("main button[aria-pressed]").filter({ hasText: new RegExp(`^\\s*${size} см`) });

/** The line total shown next to the add-to-basket button. */
async function total(page: Page): Promise<number> {
  const txt = await page.getByTestId("product-total").innerText();
  return eur(txt);
}

async function crustState(page: Page) {
  return Promise.all(
    CRUSTS.map(async (n) => {
      const row = crustRow(page, n);
      return { name: n, disabled: await row.isDisabled(), text: (await row.innerText()).replace(/\s+/g, " ") };
    })
  );
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.goto(`${BASE}/product/${SLUG}`);
    await page.waitForLoadState("networkidle");

    const sizes = await page.locator("main button[aria-pressed]").filter({ hasText: /см/ }).filter({ hasNotText: /борд/ }).allInnerTexts();
    console.log(`Product ${SLUG}: sizes ${JSON.stringify(sizes.map((s) => s.replace(/\s+/g, " ")))}`);
    console.log(
      sizes.some((s) => /\d+\s*g/.test(s))
        ? "  (size label carries the weight — the production case)"
        : "  (plain size label — regression run)"
    );

    for (const [size, price] of [[30, 3.58], [40, 4.6]] as const) {
      await sizeButton(page, size).click();
    await openAddons(page);
      const state = await crustState(page);
      check(state.every((c) => !c.disabled), `${size} cm: all four crusts selectable`, state);
      check(state.every((c) => !/Недостъпно/.test(c.text)), `${size} cm: no "Недостъпно за този размер"`);
      check(state.every((c) => eur(c.text) === price), `${size} cm: every crust +${price.toFixed(2)} €`, state.map((c) => c.text));
    }

    // 30 cm: pick, swap, un-pick.
    await sizeButton(page, 30).click();
    await openAddons(page);
    const base30 = await total(page);
    await crustRow(page, "Кашкавален борд").click();
    check((await crustRow(page, "Кашкавален борд").getAttribute("aria-pressed")) === "true", "30 cm: cheese crust picked");
    check(Math.abs((await total(page)) - (base30 + 3.58)) < 0.005, `30 cm total ${base30} + 3.58`, await total(page));
    await crustRow(page, "Филаделфия борд").click();
    const pressed = await Promise.all(CRUSTS.map((n) => crustRow(page, n).getAttribute("aria-pressed")));
    check(pressed.filter((p) => p === "true").length === 1 && pressed[1] === "true", "picking another crust replaces the first (one crust only)", pressed);
    check(Math.abs((await total(page)) - (base30 + 3.58)) < 0.005, "swap keeps the price at +3.58");
    await crustRow(page, "Филаделфия борд").click();
    check(Math.abs((await total(page)) - base30) < 0.005, `un-picking the crust brings the total back to ${base30}`, await total(page));

    // Size change with a crust picked.
    await crustRow(page, "Пеперони борд").click();
    await sizeButton(page, 40).click();
    await openAddons(page);
    const base40 = eur(await sizeButton(page, 40).innerText());
    check((await crustRow(page, "Пеперони борд").getAttribute("aria-pressed")) === "true", "30 → 40 cm: the crust stays picked");
    check(Math.abs((await total(page)) - (base40 + 4.6)) < 0.005, `40 cm total ${base40} + 4.60`, await total(page));
    await sizeButton(page, 30).click();
    await openAddons(page);
    check(Math.abs((await total(page)) - (base30 + 3.58)) < 0.005, "40 → 30 cm: re-priced to +3.58", await total(page));
    await sizeButton(page, 40).click();
    await openAddons(page);

    // Into the basket.
    await page.locator("main button").filter({ hasText: /Добави в количката/ }).first().click();
    await page.waitForTimeout(800);
    const closed = await page.getByText(/затворен|затворено/i).count();
    await page.goto(`${BASE}/cart`);
    await page.waitForLoadState("networkidle");
    const cart = await page.locator("main").innerText();
    if (!/Пеперони борд/.test(cart) && closed > 0) {
      console.log("  ! the pizzeria is closed right now — basket/checkout steps skipped");
    } else {
      check(/Пеперони борд/.test(cart), "basket shows «Пеперони борд»");
      check(/4[.,]60\s*€/.test(cart), "basket shows the crust price 4.60 €");
      check(/40 см/.test(cart), "basket shows 40 см");
      await page.goto(`${BASE}/checkout`);
      await page.waitForLoadState("networkidle");
      const co = await page.locator("main").innerText();
      check(/Пеперони борд/.test(co), "checkout shows «Пеперони борд»");
    }
  } finally {
    await browser.close();
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
