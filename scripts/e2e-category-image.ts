/**
 * Browser check for category photos (Admin → Категории), at phone width:
 *   add → preview → Запази → saved, reload, shown on the public menu + home;
 *   change → old file removed; invalid file → clear error, nothing lost;
 *   no admin session / customer session → refused, nothing written.
 *
 * Runs against an already running LOCAL server (never production):
 *   E2E_BASE_URL=http://localhost:3061 UPLOADS_DIR=<same dir as the server> \
 *     npm run e2e:category-image
 * Creates two throwaway accounts and restores the category it edits.
 */
import { chromium, type Page } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { extractCategoryImageFilename, getUploadsRoot } from "@/lib/uploads/paths";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3061";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
  throw new Error("e2e:category-image only runs against a local server");
}
const OUT = path.join(process.cwd(), ".data", "e2e-category-image");
mkdirSync(OUT, { recursive: true });

const PASSWORD = "CatImg-Test-2026!";
const ADMIN = "catimg-admin@test.local";
const CUSTOMER = "catimg-customer@test.local";
const STAFF = "catimg-staff@test.local";
const CATEGORY_ID = "cat_burgers";

let failures = 0;
function check(cond: unknown, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

async function photo(width: number, height: number, color: string, orientation?: number) {
  let img = sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 90 });
  if (orientation) img = img.withMetadata({ orientation });
  const file = path.join(OUT, `photo-${width}x${height}-${orientation ?? 1}.jpg`);
  await img.toFile(file);
  return file;
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/auth/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/auth/login")), page.click('form button[type="submit"]')]);
}

const row = (page: Page) =>
  page.locator("form").filter({ has: page.locator(`#category-image-${CATEGORY_ID}`) });

async function categoryRow() {
  return db.menuCategory.findUniqueOrThrow({ where: { id: CATEGORY_ID } });
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function main() {
  const original = await categoryRow();
  const passwordHash = await hashPassword(PASSWORD);
  for (const [email, role] of [[ADMIN, "ADMIN"], [STAFF, "STAFF"], [CUSTOMER, "CUSTOMER"]] as const) {
    await db.user.upsert({
      where: { email },
      create: { email, passwordHash, fullName: `E2E ${role}`, role },
      update: { passwordHash, role, isActive: true },
    });
  }

  // Portrait phone photo: stored landscape pixels + EXIF "rotate 90°".
  const portrait = await photo(1600, 900, "#b22222", 6);
  const second = await photo(800, 800, "#2e7d32");
  const fake = path.join(OUT, "not-a-photo.jpg");
  writeFileSync(fake, "this is text, not a picture");

  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    // ── Refused without an admin session ──────────────────────────────
    await page.goto(`${BASE}/admin/categories`);
    check(/\/login/.test(page.url()), "no session: /admin/categories redirects to login");
    await login(page, CUSTOMER);
    await page.goto(`${BASE}/admin/categories`);
    check(/unauthorized|login/.test(page.url()), "customer: /admin/categories is refused");
    await context.clearCookies();

    // ── Admin page at phone width ─────────────────────────────────────
    await login(page, ADMIN);
    await page.goto(`${BASE}/admin/categories`);
    const r = row(page);
    check((await page.getByText("Емоджи, напр.").count()) === 0, "no emoji hint left");
    check((await page.getByLabel("Икона").count()) === 0, "no „Икона“ field left");
    check(
      (await r.locator('input[type="file"]').getAttribute("capture")) === null,
      "file input has no capture attribute"
    );
    const addBtn = r.getByRole("button", { name: original.imageUrl ? "Смени снимката" : "Добави снимка" });
    check(await addBtn.isVisible(), "button shows „Добави снимка“ when there is no photo");
    const box = await addBtn.boundingBox();
    check(box && box.height >= 44, `photo button is ≥ 44 px tall (${box?.height})`);
    check(await noHorizontalScroll(page), "admin page: no horizontal scroll at 390 px");
    await page.screenshot({ path: path.join(OUT, "1-admin-before.png"), fullPage: false });

    // Pick → instant preview, nothing saved yet
    await r.locator('input[type="file"]').setInputFiles(portrait);
    const preview = r.locator("img");
    await preview.waitFor();
    check((await preview.getAttribute("src"))?.startsWith("blob:"), "instant local preview after picking");
    check(await r.getByText("Новата снимка ще се запази").isVisible(), "pending-photo hint shown");
    check((await categoryRow()).imageUrl === original.imageUrl, "picking alone does not save");
    await r.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "2-admin-preview.png") });

    // Save with the existing „Запази“, together with a name change
    await r.locator('input[name="nameEn"]').fill("Burgers (photo test)");
    await r.getByRole("button", { name: "Запази" }).click();
    await r.getByText("Категорията и снимката са запазени.").waitFor({ timeout: 20000 });
    check(true, "save shows success");
    const saved = await categoryRow();
    check(saved.imageUrl?.startsWith("/uploads/categories/"), `DB has the photo path (${saved.imageUrl})`);
    check(saved.nameEn === "Burgers (photo test)", "other fields saved together with the photo");
    check(saved.icon === original.icon, "legacy emoji kept untouched as fallback");
    const firstFile = extractCategoryImageFilename(saved.imageUrl!)!;
    const firstPath = path.join(getUploadsRoot(), "categories", firstFile);
    check(existsSync(firstPath), "file written under UPLOADS_DIR");
    // From a buffer: sharp(path) keeps a cached file handle, which blocks the
    // later deletion on Windows.
    const meta = await sharp(readFileSync(firstPath)).metadata();
    check(meta.format === "webp" && meta.height! > meta.width!, `stored upright as WebP (${meta.width}×${meta.height})`);

    // Reload → admin preview is the saved photo
    await page.reload();
    const savedImg = row(page).locator("img");
    check((await savedImg.getAttribute("src")) === saved.imageUrl, "after reload the saved photo is shown");
    check(await row(page).getByRole("button", { name: "Смени снимката" }).isVisible(), "button says „Смени снимката“");
    await row(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "3-admin-saved.png") });

    // ── Public menu (phone) ───────────────────────────────────────────
    const res = await page.request.get(`${BASE}${saved.imageUrl}`);
    check(res.ok() && res.headers()["content-type"] === "image/webp", "public photo URL serves image/webp");

    await page.goto(`${BASE}/menu`);
    const altBg = `Снимка на категория „${saved.nameBg}“`;
    const heading = page.locator(`#heading-burgers img`);
    check((await heading.getAttribute("alt")) === altBg, "menu section heading shows the photo with alt text");
    const fit = await heading.evaluate((el) => getComputedStyle(el).objectFit);
    check(fit === "cover", "object-fit: cover");
    check(
      (await page.locator(`nav a[href="#category-burgers"] img`).count()) === 1,
      "category tabs show the photo thumbnail"
    );
    check(
      (await page.locator(`nav a[href="#category-salads"] img`).count()) === 0 &&
        (await page.locator(`nav a[href="#category-salads"]`).innerText()).includes("🥗"),
      "category without a photo still shows its emoji"
    );
    const natural = await heading.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]);
    check(natural[1] > natural[0], `photo renders upright in the browser (${natural.join("×")})`);
    check(await noHorizontalScroll(page), "/menu: no horizontal scroll at 390 px");
    await page.locator("#category-burgers").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "4-menu-phone.png") });

    await page.goto(`${BASE}/menu/burgers`);
    check((await page.locator(`#heading-burgers img`).count()) === 1, "/menu/burgers shows the photo");

    await page.goto(`${BASE}/`);
    const tile = page.locator(`a[href$="/menu/burgers"] img`).first();
    check((await tile.count()) === 1, "home category tile shows the photo");
    check(await noHorizontalScroll(page), "home: no horizontal scroll at 390 px");
    await tile.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "5-home-phone.png") });

    await page.goto(`${BASE}/en/menu`);
    check(
      (await page.locator(`#heading-burgers img`).getAttribute("alt")) ===
        "Photo of the Burgers (photo test) category",
      "English alt text"
    );

    // ── Change the photo → old file removed ───────────────────────────
    await page.goto(`${BASE}/admin/categories`);
    await row(page).locator('input[type="file"]').setInputFiles(second);
    await row(page).getByRole("button", { name: "Запази" }).click();
    await row(page).getByText("Категорията и снимката са запазени.").waitFor({ timeout: 20000 });
    const changed = await categoryRow();
    check(changed.imageUrl !== saved.imageUrl, "changed photo has a new path");
    check(!existsSync(firstPath), "replaced photo file was removed from disk");

    // ── Invalid file: clear error, typed data and old photo kept ──────
    await page.reload();
    await row(page).locator('input[name="nameEn"]').fill("Typed but not saved");
    await row(page).locator('input[type="file"]').setInputFiles({
      name: "animation.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    });
    check(
      await row(page).getByText("Неподдържан формат. Изберете снимка във формат JPG, PNG или WebP.").isVisible(),
      "unsupported format → clear message at once"
    );
    await row(page).locator('input[type="file"]').setInputFiles(fake); // claims JPEG, is text
    await row(page).getByRole("button", { name: "Запази" }).click();
    await row(page).getByText("Файлът не е валидна снимка (JPG, PNG или WebP).").first().waitFor({ timeout: 20000 });
    check(true, "server refuses a fake .jpg with a clear message");
    check(
      (await row(page).locator('input[name="nameEn"]').inputValue()) === "Typed but not saved",
      "typed data kept after the failed save"
    );
    const afterFail = await categoryRow();
    check(
      afterFail.imageUrl === changed.imageUrl && afterFail.nameEn === changed.nameEn,
      "failed save wrote nothing — old photo kept"
    );
    await row(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "6-admin-invalid.png") });

    // ── Session gone mid-edit → the action refuses ────────────────────
    await page.reload();
    await row(page).locator('input[type="file"]').setInputFiles(second);
    await context.clearCookies();
    await row(page).getByRole("button", { name: "Запази" }).click();
    await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => undefined);
    if (!/\/login/.test(page.url())) {
      await page.screenshot({ path: path.join(OUT, "7-expired-session.png") });
      console.log("  url:", page.url(), "| alerts:", await page.locator('[role="alert"]').allInnerTexts());
    }
    check(/\/login/.test(page.url()), "expired session: saving redirects to login");
    check((await categoryRow()).imageUrl === changed.imageUrl, "…and nothing was written");

    // ── STAFF passes the proxy's /admin rule — the action itself refuses ─
    await login(page, ADMIN);
    await page.goto(`${BASE}/admin/categories`);
    await row(page).locator('input[type="file"]').setInputFiles(second);
    const staffPage = await context.browser()!.newContext().then((c) => c.newPage());
    await login(staffPage, STAFF);
    const staffCookies = await staffPage.context().cookies();
    await staffPage.context().close();
    await context.clearCookies();
    await context.addCookies(staffCookies);
    await row(page).getByRole("button", { name: "Запази" }).click();
    await page.waitForURL(/unauthorized/, { timeout: 20000 }).catch(() => undefined);
    check(/unauthorized/.test(page.url()), `STAFF session: the action refuses (${new URL(page.url()).pathname})`);
    const afterStaff = await categoryRow();
    check(
      afterStaff.imageUrl === changed.imageUrl && afterStaff.nameEn === changed.nameEn,
      "…and nothing was written"
    );
    await context.clearCookies();

    await login(page, CUSTOMER);
    await page.goto(`${BASE}/admin/categories`);
    check(/unauthorized|login/.test(page.url()), "customer still cannot open the page");
  } finally {
    await browser.close();
    // Restore the category exactly as it was; remove what the test uploaded.
    const now = await categoryRow();
    if (now.imageUrl && now.imageUrl !== original.imageUrl) {
      const f = extractCategoryImageFilename(now.imageUrl);
      if (f) rmSync(path.join(getUploadsRoot(), "categories", f), { force: true });
    }
    await db.menuCategory.update({
      where: { id: CATEGORY_ID },
      data: { nameEn: original.nameEn, imageUrl: original.imageUrl },
    });
    await db.user.deleteMany({ where: { email: { in: [ADMIN, STAFF, CUSTOMER] } } });
    await db.$disconnect();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
  console.log(`Screenshots: ${OUT}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
