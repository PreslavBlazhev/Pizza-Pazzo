-- The bank's last answer to the verification of a NOTIFY decision (kept apart
-- from providerResponse, which holds the transaction's own details).
ALTER TABLE "PaymentAttempt" ADD COLUMN "bankCheckResult" TEXT;
