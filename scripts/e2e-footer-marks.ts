/**
 * BROWSER check of ОББ's remark "the card organisations' logos are missing
 * from the footer" (UBB-14) — against a running server or the live site.
 *
 * Not conditional: every expected mark MUST be in the footer of every page
 * checked, load (HTTP 200, decoded image) and be visibly sized, on a phone and
 * on a desktop, in Bulgarian and English. While card payment is off, the
 * footer must say so, and nothing may claim cards are accepted.
 *
 *   E2E_BASE_URL=https://pizzapazzo.bg npm run e2e:footer-marks
 *   E2E_EXPECT_MARKS=visa,mastercard,borica-company   (default)
 *   E2E_SHOTS=<folder for screenshots>
 *
 * Read-only: opens public pages, creates nothing.
 */
import { chromium, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = process.env.E2E_SHOTS ?? path.join(process.env.TEMP ?? ".", "pp-footer-shots");
const LABELS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", "borica-company": "BORICA company logo" };
const EXPECT = (process.env.E2E_EXPECT_MARKS ?? "visa,mastercard,borica-company")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PAGES = ["/", "/menu", "/contacts", "/terms", "/payment-methods"];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1366, height: 900 },
];

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function footerMarks(page: Page) {
  return page.$$eval("footer img", (imgs) =>
    (imgs as HTMLImageElement[]).map((i) => {
      const r = i.getBoundingClientRect();
      return {
        mark: i.dataset.mark ?? "",
        alt: i.alt,
        inBrandList: !!i.closest("ul"),
        src: i.currentSrc || i.src,
        ok: i.complete && i.naturalWidth > 0,
        w: r.width,
        h: r.height,
      };
    })
  );
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const failed: string[] = [];
      page.on("response", (r) => {
        if (r.url().includes("/payment-marks/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
      });
      for (const locale of ["bg", "en"]) {
        for (const p of PAGES) {
          const url = `${BASE}${locale === "en" ? "/en" : ""}${p === "/" && locale === "en" ? "" : p}`;
          console.log(`${vp.name} ${locale} ${url}`);
          const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
          check(res?.status() === 200, "page 200", String(res?.status()));
          const footer = page.locator("footer");
          await footer.scrollIntoViewIfNeeded();
          const marks = await footerMarks(page);
          for (const id of EXPECT) {
            const m = marks.find((x) => x.mark === id);
            check(!!m, `footer shows ${LABELS[id]}`);
            if (m) {
              check(m.ok, `${LABELS[id]} image loaded`, m.src);
              check(m.h >= 20 && m.w >= 20, `${LABELS[id]} visibly sized`, `${m.w.toFixed(0)}×${m.h.toFixed(0)}`);
              check(await page.locator(`footer img[data-mark="${id}"]`).isVisible(), `${LABELS[id]} visible`);
              check(m.alt.length > 2, `${LABELS[id]} has alt text`, m.alt);
              check(
                id === "borica-company" ? !m.inBrandList : m.inBrandList,
                id === "borica-company" ? "BORICA logo is NOT listed as a card brand" : `${LABELS[id]} is in the card-brand list`
              );
            }
          }
          const text = await footer.innerText();
          check(
            locale === "bg" ? text.includes("все още не е активно") : text.includes("not active yet"),
            "footer says online card payment is not active yet"
          );
          check(!/Приемаме плащане с карти|We accept card payments|Google Pay|Apple Pay/i.test(text), "no 'we accept cards' or wallet claim");
          if (p === "/") {
            await footer.screenshot({ path: path.join(SHOTS, `footer-${locale}-${vp.name}.png`) });
          }
        }
      }
      check(failed.length === 0, `every /payment-marks/ request answered 200/304 (${vp.name})`, failed.join(" | "));

      // Checkout: the marks are not offered as a way to pay, and there is no
      // card option for a guest while the POS is not live.
      const html = await (await fetch(`${BASE}/checkout`)).text();
      check(/\\?"cardMarks\\?":\[\]/.test(html), `checkout: no marks at the payment choice (${vp.name})`);
      check(/\\?"cardAvailable\\?":false/.test(html), `checkout: no card option for a guest (${vp.name})`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nscreenshots: ${SHOTS}`);
  console.log(failures === 0 ? "FOOTER MARKS OK" : `FOOTER MARKS FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
