/**
 * Creates the two demo accounts that go into Play Console → App access, so a
 * Google reviewer can see both halves of the app without ever touching a real
 * one.
 *
 *     node scripts/create-review-accounts.mjs
 *
 * Run it where the database is — locally against dev.db, or in the Render Shell
 * against production. Safe to re-run: it upserts by e-mail and resets the
 * password, which is also how you rotate the credentials after a review.
 *
 * It prints the passwords once, to paste into Play Console. They are generated
 * unless you pass your own:
 *
 *     REVIEW_CUSTOMER_PASSWORD=... REVIEW_STAFF_PASSWORD=... node scripts/create-review-accounts.mjs
 *
 * Why a script and not a note in the docs: the staff account is the one thing
 * in this submission that must NOT be the owner's. STAFF can watch the live
 * board, accept and reject orders and print tickets — enough for a reviewer to
 * verify the app, and nothing more. It cannot open /admin/users, change roles,
 * edit the menu or the restaurant's settings; see `requireRole` in lib/auth.ts
 * and the role checks in app/actions/admin-*.ts.
 *
 * Both accounts carry invented data on the `pizzapazzo.review` domain, which is
 * not a real e-mail domain: a password reset or an order confirmation sent to
 * one of them goes nowhere and reaches no customer.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Render sets DATABASE_URL in the environment; locally it lives in .env, which
// only `prisma db seed` loads for us.
if (!process.env.DATABASE_URL) {
  const env = readFileSync(join(projectRoot, ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) {
    console.error("DATABASE_URL is not set and .env does not define it.");
    process.exit(1);
  }
  process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

const db = new PrismaClient();

/**
 * A password a reviewer has to retype by hand, so: no ambiguous characters and
 * short enough to read off a form. 12 characters out of this alphabet is ~62
 * bits, far beyond anything a login form is at risk from.
 */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const accounts = [
  {
    key: "customer",
    email: "review.customer@pizzapazzo.review",
    fullName: "Review Customer",
    phone: "+359888000101",
    role: "CUSTOMER",
    password: process.env.REVIEW_CUSTOMER_PASSWORD || generatePassword(),
  },
  {
    key: "staff",
    email: "review.staff@pizzapazzo.review",
    fullName: "Review Staff",
    phone: "+359888000102",
    role: "STAFF",
    password: process.env.REVIEW_STAFF_PASSWORD || generatePassword(),
  },
];

try {
  const results = [];

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const existing = await db.user.findUnique({ where: { email: account.email } });

    // A guard against the one mistake that would matter: if somebody ever
    // renames a real account to one of these addresses, refuse rather than
    // reset its password and role.
    if (existing && existing.role !== account.role && existing.role !== "CUSTOMER") {
      console.error(
        `Refusing to touch ${account.email}: it already exists with role ${existing.role}.`
      );
      process.exitCode = 1;
      continue;
    }

    const user = await db.user.upsert({
      where: { email: account.email },
      update: { passwordHash, role: account.role, isActive: true, fullName: account.fullName },
      create: {
        email: account.email,
        passwordHash,
        fullName: account.fullName,
        phone: account.phone,
        role: account.role,
      },
    });

    results.push({ ...account, created: !existing, id: user.id });
  }

  console.log("\nDemo accounts for Play Console → App access\n");
  for (const r of results) {
    console.log(`  ${r.role.padEnd(8)} ${r.email}`);
    console.log(`           password: ${r.password}`);
    console.log(`           ${r.created ? "created" : "updated (password reset)"}\n`);
  }
  console.log("Paste them into the App access text (android-app/PLAY_STORE.md, section 9).");
  console.log("Re-run this script after the review to rotate the passwords.\n");
} finally {
  await db.$disconnect();
}
