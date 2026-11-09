/**
 * Browser check of the logo on the printed tickets, against a RUNNING server
 * on a COPY of the dev database (it creates one synthetic test order):
 *
 *   - /admin/orders/:id/print?t=kitchen|delivery|all: one logo per ticket,
 *     centred, at the paper's logo width, and NO "PIZZA PAZZO" text under it;
 *   - print media (what the dialog receives) as PDF + screenshot;
 *   - "Принтирай" waits for a slow logo before window.print();
 *   - a logo that fails, or never arrives (5 s timeout), prints the text;
 *   - /admin/settings/print preview (browser + thermal) at 80 and 58 mm.
 *
 *   E2E_BASE_URL=http://localhost:3021 AUTH_SECRET=… DATABASE_URL=file:./copy.db \
 *   npx tsx scripts/e2e-print-logo.ts [outDir]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3021").replace(/\/$/, "");
const OUT = process.argv[2] ?? "docs/evidence-print-logo";
const SECRET = process.env.AUTH_SECRET ?? "";
const prisma = new PrismaClient();
mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const LOGO = "img[data-ticket-logo]";
/** CSS px per mm at 96 dpi. */
const PX_PER_MM = 96 / 25.4;

async function staffContext(browser: Browser): Promise<BrowserContext> {
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
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  await ctx.addCookies([{ name: "pp_session", value: jwt, url: BASE }]);
  return ctx;
}

async function makeOrder() {
  const last = await prisma.order.findFirst({ orderBy: { orderNumber: "desc" } });
  return prisma.order.create({
    data: {
      orderNumber: (last?.orderNumber ?? 1000) + 1,
      customerName: "Тест Лого",
      customerEmail: "logo-e2e@example.test",
      customerPhone: "0888111222",
      deliveryAddress: "ул. Тестова 7",
      status: "ACCEPTED",
      acceptedAt: new Date(),
      estimatedTimeMinutes: 40,
      subtotalEur: 21,
      totalEur: 21,
      items: {
        create: [
          {
            productId: "prod_margarita",
            productNameBg: "Маргарита",
            variantName: "30 см",
            quantity: 2,
            unitPriceEur: 10.5,
            totalPriceEur: 21,
            categoryNameBg: "Пици",
            categorySortOrder: 1,
          },
        ],
      },
    },
  });
}

/** Per ticket on the page: logo state, header text presence, geometry. */
async function inspect(page: Page) {
  return page.$$eval(".print-ticket", (tickets, sel) =>
    tickets.map((t) => {
      const img = t.querySelector<HTMLImageElement>(sel);
      const tr = t.getBoundingClientRect();
      const ir = img?.getBoundingClientRect();
      return {
        hasLogo: !!img,
        loaded: !!img && img.complete && img.naturalWidth > 0,
        text: (t as HTMLElement).innerText,
        logoWidth: ir?.width ?? 0,
        logoHeight: ir?.height ?? 0,
        offCentre: ir ? Math.abs(ir.left + ir.width / 2 - (tr.left + tr.width / 2)) : -1,
        firstChildIsLogo: !!img && t.firstElementChild?.contains(img) === true,
      };
    }),
    LOGO
  );
}

/** Replaces window.print with a recorder of what the page looked like. */
async function stubPrint(page: Page) {
  await page.evaluate((sel) => {
    (window as unknown as { __printed: unknown[] }).__printed = [];
    window.print = () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(sel));
      (window as unknown as { __printed: unknown[] }).__printed.push({
        logos: imgs.length,
        allLoaded: imgs.every((i) => i.complete && i.naturalWidth > 0),
        text: Array.from(document.querySelectorAll<HTMLElement>(".print-ticket")).map((t) => t.innerText),
      });
    };
  }, LOGO);
}
const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __printed: { logos: number; allLoaded: boolean; text: string[] }[] }).__printed);

async function main() {
  const order = await makeOrder();
  console.log(`order #${order.orderNumber} (${order.id})`);
  const templates = await prisma.printTemplate.findMany();
  const paper = Object.fromEntries(templates.map((t) => [t.id, t.paperWidthMm])) as Record<string, number>;
  const expectedMm = (mm: number) => (mm <= 58 ? 36 : 48);

  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await staffContext(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  try {
    console.log("1. Print pages: one logo per ticket, no duplicated header text");
    for (const [t, ids] of [["kitchen", ["KITCHEN"]], ["delivery", ["DELIVERY"]], ["all", ["KITCHEN", "DELIVERY"]]] as const) {
      await page.goto(`${BASE}/admin/orders/${order.id}/print?t=${t}`);
      await page.waitForFunction((sel) => Array.from(document.querySelectorAll<HTMLImageElement>(sel)).every((i) => i.complete), LOGO);
      const info = await inspect(page);
      check(info.length === ids.length, `?t=${t}: ${ids.length} ticket(s)`);
      info.forEach((tk, i) => {
        const id = ids[i];
        check(tk.hasLogo && tk.loaded, `?t=${t} ${id}: logo loaded`);
        check(tk.firstChildIsLogo, `?t=${t} ${id}: logo is the first thing on the ticket`);
        check(!tk.text.includes("PIZZA PAZZO"), `?t=${t} ${id}: no "PIZZA PAZZO" text under the logo`, tk.text.slice(0, 80));
        check(tk.text.includes(id === "KITCHEN" ? "КУХНЯ" : "ДОСТАВКА"), `?t=${t} ${id}: ticket type still printed`);
        check(tk.text.includes(`ПОРЪЧКА #${order.orderNumber}`), `?t=${t} ${id}: rest of the ticket intact`);
        const mm = tk.logoWidth / PX_PER_MM;
        check(Math.abs(mm - expectedMm(paper[id] ?? 80)) < 0.5, `?t=${t} ${id}: logo ${mm.toFixed(1)} mm wide on ${paper[id]} mm paper`);
        check(Math.abs(tk.logoHeight / tk.logoWidth - 298 / 528) < 0.01, `?t=${t} ${id}: proportions kept`);
        check(tk.offCentre < 1, `?t=${t} ${id}: centred (${tk.offCentre.toFixed(2)} px off)`);
      });
      await shot(page, `print-${t}-screen`);
      await page.emulateMedia({ media: "print" });
      await shot(page, `print-${t}-print-media`);
      const noPrint = await page.$$eval(".no-print", (els) => els.every((e) => getComputedStyle(e).display === "none"));
      check(noPrint, `?t=${t}: buttons hidden in print media`);
      const layout = await page.evaluate(() => ({
        left: document.querySelector(".print-ticket")!.getBoundingClientRect().left,
        nav: Array.from(document.querySelectorAll("aside, nav")).some((e) => (e as HTMLElement).offsetParent !== null),
      }));
      check(!layout.nav, `?t=${t}: admin menu not printed`);
      check(layout.left < 1, `?t=${t}: ticket starts at the paper edge (${layout.left.toFixed(1)} px)`);
      await page.pdf({ path: path.join(OUT, `print-${t}.pdf`), width: `${paper.KITCHEN ?? 80}mm`, printBackground: true });
      await page.emulateMedia({ media: "screen" });
    }

    console.log("2. 'Принтирай' waits for a slow logo");
    await page.route("**/logos/pizza-pazzo-logo-print.png*", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto(`${BASE}/admin/orders/${order.id}/print?t=all`, { waitUntil: "domcontentloaded" });
    await stubPrint(page);
    const t0 = Date.now();
    await page.getByRole("button", { name: /Принтирай/ }).click();
    const waiting = await page.getByRole("button", { name: /Зареждане на логото/ }).isVisible().catch(() => false);
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length > 0, null, { timeout: 15_000 });
    const slow = (await printed(page))[0];
    check(waiting, "button shows it is waiting for the logo");
    check(slow.logos === 2 && slow.allLoaded, `print started only after both logos loaded (${Date.now() - t0} ms)`);
    check(slow.text.every((x) => !x.includes("PIZZA PAZZO")), "printed without header text");
    await page.unroute("**/logos/pizza-pazzo-logo-print.png*");

    console.log("3. A logo that fails prints the header text instead");
    await page.route("**/logos/pizza-pazzo-logo-print.png*", (route) => route.abort());
    await page.goto(`${BASE}/admin/orders/${order.id}/print?t=all`);
    await page.waitForFunction(() => document.querySelectorAll(".print-ticket").length === 2);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll<HTMLElement>(".print-ticket")).every((t) => t.innerText.includes("PIZZA PAZZO")),
      null,
      { timeout: 10_000 }
    ).catch(() => {});
    const failed = await inspect(page);
    check(failed.every((t) => !t.hasLogo), "broken logo removed");
    check(failed.every((t) => t.text.split("PIZZA PAZZO").length - 1 === 1), "header text shown once per ticket");
    await stubPrint(page);
    await page.getByRole("button", { name: /Принтирай/ }).click();
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length > 0);
    const fb = (await printed(page))[0];
    check(fb.logos === 0 && fb.text.every((x) => x.includes("PIZZA PAZZO")), "prints with the text fallback");
    await shot(page, "print-all-fallback");
    await page.unroute("**/logos/pizza-pazzo-logo-print.png*");

    console.log("4. A logo that never arrives: text after the 5 s timeout");
    await page.route("**/logos/pizza-pazzo-logo-print.png*", () => {
      /* never answered */
    });
    await page.goto(`${BASE}/admin/orders/${order.id}/print?t=kitchen`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Принтирай/ }).waitFor();
    await page.waitForTimeout(500); // hydration
    await stubPrint(page);
    const t1 = Date.now();
    await page.getByRole("button", { name: /Принтирай/ }).click();
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length > 0, null, { timeout: 15_000 });
    const hung = (await printed(page))[0];
    const took = Date.now() - t1;
    check(took >= 4500 && took < 9000, `print started after the timeout (${took} ms)`);
    check(hung.logos === 0 && hung.text[0].includes("PIZZA PAZZO"), "with the header text instead of an empty logo");
    await page.unroute("**/logos/pizza-pazzo-logo-print.png*");

    console.log("5. Settings preview at 80 and 58 mm");
    for (const t of ["kitchen", "delivery"]) {
      await page.goto(`${BASE}/admin/settings/print?t=${t}`);
      for (const mm of [80, 58]) {
        await page.locator('[name="paperWidthMm"]').selectOption(String(mm)).catch(async () => {
          await page.locator('[name="paperWidthMm"]').fill(String(mm));
        });
        await page.getByRole("button", { name: "Браузър" }).click();
        const preview = page.locator("aside", { hasText: "Както ще излезе" });
        const paperLogo = preview.locator(LOGO);
        await paperLogo.waitFor();
        const w = (await paperLogo.boundingBox())!.width / PX_PER_MM;
        check(Math.abs(w - expectedMm(mm)) < 0.5, `${t} ${mm} mm browser preview: logo ${w.toFixed(1)} mm`);
        const previewText = await preview.innerText();
        check(!previewText.includes("PIZZA PAZZO"), `${t} ${mm} mm browser preview: no header text`);
        await preview.screenshot({ path: path.join(OUT, `settings-${t}-${mm}-browser.png`) });
        await page.getByRole("button", { name: "Термо" }).click();
        await preview.locator(LOGO).waitFor();
        const thermalText = await preview.locator("pre").allInnerTexts();
        check(!thermalText.join("\n").includes("PIZZA PAZZO"), `${t} ${mm} mm thermal preview: logo, no header text`);
        await preview.screenshot({ path: path.join(OUT, `settings-${t}-${mm}-thermal.png`) });
      }
    }

    check(errors.length === 0, "no page errors", errors.join(" | "));
  } finally {
    await browser.close();
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? "\nALL OK" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
