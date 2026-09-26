-- Honest accounting for the restaurant's "new order" e-mail.
--
-- Until now `notificationSentAt` was stamped BEFORE the e-mail was sent, and
-- a Resend failure was only logged — so an order could look notified while
-- no e-mail ever left. From now on `notificationSentAt` means "Resend
-- accepted it", and these columns record everything else (skipped, failed,
-- how many attempts, why), so a failure is visible and retried.
--
-- Plain ADD COLUMN — every column is nullable or defaulted, so SQLite adds
-- them in place and `migrate deploy` keeps every existing row as it is.

ALTER TABLE "Order" ADD COLUMN "notificationStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "notificationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "notificationError" TEXT;
ALTER TABLE "Order" ADD COLUMN "notificationClaimedAt" DATETIME;

-- Orders from before this migration: whatever happened to their e-mail
-- happened long ago and cannot be re-sent sensibly. Mark them as settled
-- (LEGACY), never as retryable.
UPDATE "Order"
SET "notificationStatus" = 'LEGACY',
    "notificationAttempts" = 1
WHERE "notificationSentAt" IS NOT NULL OR "releasedToKitchenAt" IS NOT NULL;
