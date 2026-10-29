/**
 * Test environment for the UPC (ОББ) suites — the shared setup first (fresh
 * SQLite from the real migrations), then the configuration the live site
 * runs during the bank tests: APP_ENV=production with ОББ's TEST terminal,
 * staff only.
 *
 * The keys are generated here, per run. They are NOT the merchant's real key
 * (that one never leaves the secret store) and the "gateway" key stands in
 * for UPC's, so the tests can sign NOTIFY messages the way UPC does.
 */
import "./setup-env.mjs";
import { generateKeyPairSync } from "node:crypto";

const merchant = generateKeyPairSync("rsa", { modulusLength: 2048 });
const gateway = generateKeyPairSync("rsa", { modulusLength: 2048 });

process.env.APP_ENV = "production";
process.env.APP_BASE_URL = "https://pizzapazzo.bg";
process.env.CARD_PAYMENTS_ENABLED = "true";
process.env.PAYMENT_PROVIDER = "upc";
process.env.PAYMENT_ENV = "sandbox";
process.env.PAYMENT_SANDBOX_AUDIENCE = "staff";
process.env.PAYMENT_CURRENCY = "EUR";
process.env.UPC_MERCHANT_ID = "1731096";
process.env.UPC_TERMINAL_ID = "E7059096";
process.env.UPC_PRIVATE_KEY = Buffer.from(
  merchant.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
).toString("base64");
process.env.UPC_GATEWAY_CERT = gateway.publicKey.export({ type: "spki", format: "pem" }).toString();
process.env.UPC_SESSION_TTL_MINUTES = "20";

// Test-only handles for the suites (never read by the application).
process.env.TEST_UPC_MERCHANT_PUBLIC_KEY = merchant.publicKey.export({ type: "spki", format: "pem" }).toString();
process.env.TEST_UPC_GATEWAY_PRIVATE_KEY = gateway.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
