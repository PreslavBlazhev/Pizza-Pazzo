/**
 * Renders the customer "order accepted" e-mail for the bundled sample order
 * (synthetic data) — plain text to stdout, and with an output folder also the
 * HTML and text files. Nothing is sent.
 *
 *   npx tsx scripts/preview-accepted-email.ts [outDir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import { SAMPLE_PRINT_ORDER } from "@/lib/printer/sample-order";

const order = { ...SAMPLE_PRINT_ORDER, items: SAMPLE_PRINT_ORDER.items ?? [] };
const mail = customerOrderAcceptedEmail(order, {
  phone: "064 801 999",
  trackingUrl: "https://pizzapazzo.bg/track#t=EXAMPLE-TOKEN",
});
console.log(`Subject: ${mail.subject}\n\n${mail.text}`);

const out = process.argv[2];
if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "accepted-email.html"), `<!doctype html><meta charset="utf-8">${mail.html}`);
  writeFileSync(path.join(out, "accepted-email.txt"), `Subject: ${mail.subject}\n\n${mail.text}\n`);
}
