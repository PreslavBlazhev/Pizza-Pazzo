// Prepares a STAGING database: test accounts + the menu. Idempotent.
//
//   node scripts/seed-staging.mjs        (render.staging.yaml runs it on every start)
//
// Refuses to run unless APP_ENV is "staging" or "development", so it can
// never create demo logins on the real restaurant's database.
//
// Accounts (e-mails on the reserved .test domain — they cannot receive mail):
//   admin@staging.pizzapazzo.test     SUPER_ADMIN   password: STAGING_ADMIN_PASSWORD
//   staff@staging.pizzapazzo.test     STAFF         password: STAGING_STAFF_PASSWORD
//   customer@staging.pizzapazzo.test  CUSTOMER      password: STAGING_CUSTOMER_PASSWORD
// A missing password skips that account. Passwords are (re)set on every run,
// so changing the variable in Render and restarting changes the login.
//
// The menu is imported from data/*.json only when the menu table is EMPTY —
// a restart never wipes menu edits made while testing.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const appEnv = (process.env.APP_ENV ?? "").trim().toLowerCase();
if (appEnv !== "staging" && appEnv !== "development") {
  console.error(`seed-staging: refusing to run with APP_ENV="${appEnv || "(unset)"}" — staging/development only.`);
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PrismaClient();

const ACCOUNTS = [
  { email: "admin@staging.pizzapazzo.test", role: "SUPER_ADMIN", fullName: "Staging Admin", env: "STAGING_ADMIN_PASSWORD" },
  { email: "staff@staging.pizzapazzo.test", role: "STAFF", fullName: "Staging Кухня", env: "STAGING_STAFF_PASSWORD" },
  { email: "customer@staging.pizzapazzo.test", role: "CUSTOMER", fullName: "Тест Клиент", env: "STAGING_CUSTOMER_PASSWORD" },
];

async function main() {
  for (const a of ACCOUNTS) {
    const password = process.env[a.env];
    if (!password || password.length < 12) {
      console.warn(`seed-staging: ${a.env} missing or shorter than 12 characters — ${a.email} skipped`);
      continue;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.user.upsert({
      where: { email: a.email },
      update: { role: a.role, passwordHash, isActive: true },
      create: { email: a.email, passwordHash, fullName: a.fullName, role: a.role, phone: "0888000000" },
    });
    console.log(`seed-staging: ✔ ${a.role} ${a.email}`);
  }

  const products = await db.menuProduct.count();
  if (products === 0) {
    console.log("seed-staging: menu is empty — importing data/*.json");
    execFileSync(process.execPath, [path.join(root, "scripts", "import-menu-to-db.mjs")], {
      stdio: "inherit",
      env: process.env,
    });
  } else {
    console.log(`seed-staging: menu already has ${products} products — left as it is`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
