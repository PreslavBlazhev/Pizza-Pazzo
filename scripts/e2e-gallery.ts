/**
 * Browser check for Admin → Галерия, at phone width:
 *   replace tile №1 → saved, shown as the big tile on the home page;
 *   add a new photo → goes in front; move it down; remove it → file deleted;
 *   invalid file → clear error; STAFF / customer → refused.
 *
 * Runs against an already running LOCAL server (never production):
 *   E2E_BASE_URL=http://localhost:3062 npm run e2e:gallery
 * Creates throwaway accounts and restores the gallery rows it changes.
 */
import { chromium, type Page } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { extractGalleryImageFilename, getUploadsRoot } from "@/lib/uploads/paths";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3062";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
  throw new Error("e2e:gallery only runs against a local server");
}
const OUT = path.join(process.cwd(), ".data", "e2e-gallery");
mkdirSync(OUT, { recursive: true });

const PASSWORD = "Gallery-Test-2026!";
const ADMIN = "gallery-admin@test.local";
const STAFF = "gallery-staff@test.local";

let failures = 0;
function check(cond: unknown, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

async function photo(name: string, color: string) {
  const file = path.join(OUT, name);
  await sharp({ create: { width: 2000, height: 1500, channels: 3, background: color } })
    .jpeg({ quality: 90 })
    .toFile(file);
  return file;
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/auth/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/auth/login")),
    page.click('form button[type="submit"]'),
  ]);
}

const card = (page: Page, id: string) =>
  page.locator("form").filter({ has: page.locator(`#gallery-image-${id}`) });

const ordered = () =>
  db.galleryImage.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

const fileOnDisk = (url: string) => {
  const name = extractGalleryImageFilename(url);
  return name ? existsSync(path.join(getUploadsRoot(), "gallery", name)) : false;
};

async function main() {
  const originalRows = await ordered();
  const passwordHash = await hashPassword(PASSWORD);
  for (const [email, role] of [[ADMIN, "ADMIN"], [STAFF, "STAFF"]] as const) {
    await db.user.upsert({
      where: { email },
      create: { email, passwordHash, fullName: `E2E ${role}`, role },
      update: { passwordHash, role, isActive: true },
    });
  }
  const red = await photo("red.jpg", "#b22222");
  const green = await photo("green.jpg", "#2e7d32");
  const fake = path.join(OUT, "not-a-photo.jpg");
  writeFileSync(fake, "this is text, not a picture");

  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // A cold `next dev` compiles each route on first visit — allow for it.
  context.setDefaultTimeout(180_000);
  context.setDefaultNavigationTimeout(180_000);
  const page = await context.newPage();
  let createdId: string | null = null;

  try {
    await login(page, ADMIN);
    await page.goto(`${BASE}/admin/gallery`);
    check(await page.getByRole("heading", { name: "Галерия" }).isVisible(), "admin sees the Галерия page");
    check(
      await page.getByRole("link", { name: "Галерия" }).first().isVisible().catch(() => false) ||
        (await page.locator('a[href$="/admin/gallery"]').count()) > 0,
      "Галерия link is in the admin menu"
    );
    check(
      await page.getByText("Примерна картинка — сменете я").first().isVisible(),
      "placeholder tiles are marked for replacement"
    );
    await page.screenshot({ path: path.join(OUT, "1-admin-before.png"), fullPage: true });

    // ── Invalid file → message, nothing written ─────────────────────────
    const first = originalRows[0];
    await card(page, first.id).locator('input[type="file"]').setInputFiles(fake);
    await card(page, first.id).getByRole("button", { name: "Запази" }).click();
    await page.waitForTimeout(1500);
    check(
      await card(page, first.id).getByRole("alert").first().isVisible(),
      "a non-image file gets a clear error"
    );
    check((await db.galleryImage.findUniqueOrThrow({ where: { id: first.id } })).imageUrl === first.imageUrl, "…and nothing is saved");

    // ── Replace tile №1 ─────────────────────────────────────────────────
    await page.goto(`${BASE}/admin/gallery`);
    await card(page, first.id).locator('input[type="file"]').setInputFiles(red);
    await card(page, first.id).locator('input[name="captionBg"]').fill("Пица Капричоза");
    await card(page, first.id).getByRole("button", { name: "Запази" }).click();
    await card(page, first.id).getByText("Снимката е сменена.").waitFor({ timeout: 20000 });
    const replaced = await db.galleryImage.findUniqueOrThrow({ where: { id: first.id } });
    check(replaced.imageUrl.startsWith("/uploads/gallery/"), "tile №1 now points at the uploaded photo");
    check(replaced.captionBg === "Пица Капричоза", "caption saved");
    check(fileOnDisk(replaced.imageUrl), "photo file is on the uploads disk");
    const served = await page.request.get(`${BASE}${replaced.imageUrl}`);
    check(served.ok() && served.headers()["content-type"] === "image/webp", "photo is served as WebP");
    const meta = await sharp(Buffer.from(await served.body())).metadata();
    check(meta.width === 1600 && meta.height === 1200, "photo resized to 1600×1200");

    // ── Public home + gallery page ──────────────────────────────────────
    const home = await context.newPage();
    await home.setViewportSize({ width: 1280, height: 900 });
    await home.goto(`${BASE}/`);
    const homeSrcs = await home.locator("figure img").evaluateAll((els) => els.map((e) => e.getAttribute("src") ?? ""));
    check(homeSrcs[0]?.includes(replaced.imageUrl), "home page big tile shows the new photo");
    check(homeSrcs.length === 5, `home page shows 5 tiles (got ${homeSrcs.length})`);
    check(await home.getByText("Пица Капричоза").first().isVisible(), "caption shown on the home page");
    await home.locator("figure").first().scrollIntoViewIfNeeded();
    await home.screenshot({ path: path.join(OUT, "2-home.png") });
    await home.goto(`${BASE}/en/gallery`);
    check((await home.locator("figure").count()) === originalRows.length, "/en/gallery shows every tile");
    await home.close();

    // ── Add a new photo (goes in front) ─────────────────────────────────
    await page.goto(`${BASE}/admin/gallery`);
    const newCard = card(page, "new");
    await newCard.locator('input[type="file"]').setInputFiles(green);
    await newCard.locator('input[name="captionBg"]').fill("Нова снимка");
    await newCard.getByRole("button", { name: "Добави в галерията" }).click();
    await newCard.getByText("Снимката е добавена").waitFor({ timeout: 20000 });
    let rows = await ordered();
    createdId = rows[0].captionBg === "Нова снимка" ? rows[0].id : null;
    check(createdId !== null && rows.length === originalRows.length + 1, "new photo added in front");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "3-admin-after-add.png"), fullPage: true });

    // ── Move it down ────────────────────────────────────────────────────
    if (createdId) {
      await card(page, createdId).getByRole("button", { name: "Премести назад" }).click();
      await page.waitForTimeout(2000);
      rows = await ordered();
      check(rows[1]?.id === createdId, "↓ moves it to place №2");

      // ── Remove it ─────────────────────────────────────────────────────
      const url = rows[1].imageUrl;
      await card(page, createdId).getByRole("button", { name: "Премахни" }).click();
      await card(page, createdId).getByRole("button", { name: "Да, премахни" }).click();
      await page.waitForTimeout(2000);
      check(!(await db.galleryImage.findUnique({ where: { id: createdId } })), "tile removed from the DB");
      check(!fileOnDisk(url), "its file removed from disk");
      createdId = null;
    }

    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "no sideways scrolling on a phone"
    );

    // ── STAFF is refused ────────────────────────────────────────────────
    const staffCtx = await browser.newContext();
    staffCtx.setDefaultTimeout(180_000);
    staffCtx.setDefaultNavigationTimeout(180_000);
    const staff = await staffCtx.newPage();
    await login(staff, STAFF);
    await staff.goto(`${BASE}/admin/gallery`);
    check(!staff.url().includes("/admin/gallery"), "STAFF is redirected away from /admin/gallery");
    await staffCtx.close();
  } finally {
    await browser.close();
    // Restore the gallery exactly as it was.
    const now = await db.galleryImage.findMany();
    for (const row of now) {
      const orig = originalRows.find((o) => o.id === row.id);
      if (!orig) {
        await db.galleryImage.delete({ where: { id: row.id } });
      } else {
        await db.galleryImage.update({
          where: { id: row.id },
          data: { imageUrl: orig.imageUrl, captionBg: orig.captionBg, captionEn: orig.captionEn, sortOrder: orig.sortOrder },
        });
      }
    }
    await db.user.deleteMany({ where: { email: { in: [ADMIN, STAFF] } } });
  }

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
