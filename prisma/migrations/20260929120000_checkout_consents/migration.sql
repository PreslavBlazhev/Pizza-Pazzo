-- UBB-16: proof of the explicit checkout confirmations.
-- Nullable on purpose: orders placed before this migration keep NULL — no
-- consent is invented for them. Existing rows and columns are untouched.
ALTER TABLE "Order" ADD COLUMN "consentTermsVersion" TEXT;
ALTER TABLE "Order" ADD COLUMN "consentRefundsVersion" TEXT;
ALTER TABLE "Order" ADD COLUMN "consentPrivacyVersion" TEXT;
ALTER TABLE "Order" ADD COLUMN "consentRecordedAt" DATETIME;

-- UBB-04: the second phone was stored without its area code ("+359 801 999",
-- not a dialable number). The owner's own site publishes 064 801 999
-- (tel:+35964801999). Only that exact broken value is corrected; a number the
-- owner has since edited is left alone.
UPDATE "RestaurantSettings"
SET "secondaryPhone" = '+359 64 801 999'
WHERE "secondaryPhone" = '+359 801 999';
