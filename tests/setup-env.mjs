/**
 * Test environment — loaded with `node --import` BEFORE any test module, so
 * the Prisma client and the payment configuration see these values.
 *
 * Every run gets a brand-new SQLite file in the OS temp folder, built by the
 * project's real migrations (`prisma migrate deploy`). The development
 * database (prisma/dev.db) and anything on Render are never touched.
 */
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pp-payments-test-"));
const dbFile = join(dir, "test.db").replace(/\\/g, "/");

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

execSync("npx prisma migrate deploy", {
  stdio: "ignore",
  env: process.env,
});
