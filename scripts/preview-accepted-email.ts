/**
 * Prints the customer "order accepted" e-mail (plain-text part) for the
 * bundled sample order, with the merchant block exactly as the sender builds
 * it. Nothing is sent. Usage: npx tsx scripts/preview-accepted-email.ts
 */
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import { SAMPLE_PRINT_ORDER } from "@/lib/printer/sample-order";
import { companyFor } from "@/content/legal/company";
import { LEGAL_VERSIONS } from "@/content/legal/versions";

const c = companyFor("bg");
const order = {
  ...SAMPLE_PRINT_ORDER,
  items: SAMPLE_PRINT_ORDER.items ?? [],
  consent: {
    termsVersion: LEGAL_VERSIONS.terms,
    refundsVersion: LEGAL_VERSIONS.refunds,
    privacyVersion: LEGAL_VERSIONS.privacy,
    recordedAt: new Date().toISOString(),
  },
};
const mail = customerOrderAcceptedEmail(order, {
  phone: "+359 88 248 4777",
  email: "pr2.blazhev@gmail.com",
  siteUrl: "https://pizzapazzo.bg",
  merchant: {
    legalName: c.legalName,
    uic: c.uic,
    vatNumber: c.vatNumber,
    registeredAddress: c.correspondenceAddress,
  },
});
console.log(`Subject: ${mail.subject}\n\n${mail.text}`);
