/** Checks the real proxy/SSR role boundary and immediate menu-cache expiry. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { db } from "@/lib/db";
import { getAppEnv } from "@/lib/app-env";
import { SESSION_COOKIE, signSession } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { USER_ROLES, type UserRole } from "@/types/auth";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3316").replace(/\/$/, "");
const host = new URL(BASE).hostname;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(host), "local server only");
assert.notEqual(getAppEnv(), "production", "never run on the production database");
assert.ok((process.env.DATABASE_URL ?? "").includes("next16"), "dedicated migration-test database required");

const tokens = new Map<UserRole, string>();
const emails = USER_ROLES.map((role) => `next16-${role.toLowerCase()}@example.test`);
let checks = 0;

async function allowed(path: string, role?: UserRole) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: role ? { Cookie: `${SESSION_COOKIE}=${tokens.get(role)}` } : {},
  });
  assert.equal(response.status, 200, `${role ?? "guest"} can open ${path}`);
  await response.text();
  checks++;
  console.log(`OK ${role ?? "guest"}: ${path}`);
}

async function redirected(path: string, target: string, role?: UserRole, token?: string) {
  const cookie = token ?? (role ? tokens.get(role) : undefined);
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
  assert.ok([302, 303, 307, 308].includes(response.status), `${path} is guarded`);
  assert.equal(new URL(response.headers.get("location")!, BASE).pathname, target);
  await response.text();
  checks++;
  console.log(`OK ${role ?? "guest"}: ${path} -> ${target}`);
}

async function main() {
  const passwordHash = await hashPassword("next16-local-test-password-only");
  for (const role of USER_ROLES) {
    const email = `next16-${role.toLowerCase()}@example.test`;
    const user = await db.user.upsert({
      where: { email },
      create: { email, role, fullName: `Next 16 ${role}`, passwordHash, isActive: true },
      update: { role, passwordHash, isActive: true },
    });
    tokens.set(role, await signSession({ sub: user.id, email, role }));
  }

  for (const prefix of ["", "/en"]) {
    await allowed(`${prefix}/checkout`);
    await redirected(`${prefix}/profile`, `${prefix}/auth/login`);
    await redirected(`${prefix}/admin/products`, `${prefix}/auth/login`);
    await redirected(`${prefix}/admin/products`, `${prefix}/unauthorized`, "CUSTOMER");
    await allowed(`${prefix}/profile`, "CUSTOMER");
    await allowed(`${prefix}/admin/products`, "STAFF");
    await redirected(`${prefix}/admin/settings`, `${prefix}/unauthorized`, "STAFF");
    await allowed(`${prefix}/admin/settings`, "ADMIN");
    await redirected(`${prefix}/admin/users`, `${prefix}/unauthorized`, "STAFF");
    await allowed(`${prefix}/admin/users`, "ADMIN");
    await allowed(`${prefix}/admin/settings`, "SUPER_ADMIN");
    await allowed(`${prefix}/admin/users`, "SUPER_ADMIN");
    await redirected(`${prefix}/admin/products`, `${prefix}/auth/login`, undefined, "invalid-token");
  }

  // Warm the cached public menu, then change availability through the real
  // Server Action. A fresh visitor must see the change on the next request.
  const product = await db.menuProduct.findUniqueOrThrow({ where: { id: "prod_moyata_patso" } });
  assert.equal(product.isAvailable, true);
  await allowed(`/product/${product.slug}`);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  await context.addCookies([{ name: SESSION_COOKIE, value: tokens.get("SUPER_ADMIN")!, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const visitor = await browser.newPage();
  try {
    await page.goto(`${BASE}/admin/products`);
    const form = page.locator("form").filter({ has: page.locator(`input[name="productId"][value="${product.id}"]`) });
    await form.getByRole("button", { name: "Скрий", exact: true }).click();
    await form.getByRole("button", { name: "Покажи", exact: true }).waitFor();
    await visitor.goto(`${BASE}/product/${product.slug}`);
    await visitor.getByText("Няма наличност", { exact: true }).waitFor();
    checks++;
    console.log("OK availability change immediately expires the public menu cache");

    await form.getByRole("button", { name: "Покажи", exact: true }).click();
    await form.getByRole("button", { name: "Скрий", exact: true }).waitFor();
    await visitor.reload();
    await visitor.getByText("В наличност", { exact: true }).waitFor();
    checks++;
    console.log("OK restored availability immediately reaches the public menu");
  } finally {
    await browser.close();
    await db.menuProduct.update({ where: { id: product.id }, data: { isAvailable: product.isAvailable } });
  }
  console.log(`Framework upgrade: ${checks} checks passed`);
}

main()
  .finally(async () => {
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.$disconnect();
  })
  .catch((error) => { console.error(error); process.exitCode = 1; });
