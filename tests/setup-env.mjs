/**
 * Test environment — loaded with `node --import` BEFORE any test module, so
 * the Prisma client and the payment configuration see these values.
 *
 * Every run gets a brand-new SQLite file in the OS temp folder, built by the
 * project's real migrations (`prisma migrate deploy`). The development
 * database (prisma/dev.db) and anything on Render are never touched.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pp-payments-test-"));
const dbFile = join(dir, "test.db").replace(/\\/g, "/");
// Explicitly create the fresh file: Prisma 5's Windows CLI can fail its
// connection probe for a missing SQLite file before it applies migrations.
writeFileSync(dbFile, "");

process.env.DATABASE_URL = `file:${dbFile}`;
process.env.NODE_ENV = "test";
process.env.APP_ENV = "development";
process.env.APP_BASE_URL = "http://localhost:3999";
process.env.CARD_PAYMENTS_ENABLED = "true";
process.env.PAYMENT_PROVIDER = "simulator";
process.env.PAYMENT_SIMULATOR_SECRET = "test-simulator-secret-0123456789";
// No e-mail is ever sent from tests: without a key the sender logs and skips,
// and the tests count those log lines to prove "exactly once".
// EMPTY, not deleted: Prisma loads .env into process.env for every variable
// that is not already defined, and the local .env holds a real Resend key.
process.env.RESEND_API_KEY = "";
process.env.ORDER_NOTIFICATION_EMAIL = "kitchen@example.test";
process.env.FROM_EMAIL = "test@example.test";
// Signs the order receipt and the tracking tokens. Set here so the suites do
// not depend on whatever the developer's shell or .env happens to hold.
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef-tests-only";

// Orders exist only until 22:30 Europe/Sofia (lib/order-retention.ts), and no
// order can be placed between 22:30 and midnight. So that the suites pass at
// any hour, a run that starts inside that window moves the retention clock
// two hours back — the same Sofia day, so "today" in the reports still
// matches. Tests about the cutoff itself pin the clock explicitly
// (setRetentionClockForTests).
{
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (hour * 60 + minute >= 22 * 60 + 25) globalThis.__ppRetentionOffsetMs = -2 * 60 * 60 * 1000;
}

execSync("npx prisma migrate deploy", {
  stdio: "ignore",
  env: process.env,
});
