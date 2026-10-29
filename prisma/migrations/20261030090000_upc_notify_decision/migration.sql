-- UPC NOTIFY: the binding answer per attempt, and its bank verification.
ALTER TABLE "PaymentAttempt" ADD COLUMN "notifyAction" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "notifyReason" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "notifyXid" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "notifyTranCode" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "notifyDecidedAt" DATETIME;
ALTER TABLE "PaymentAttempt" ADD COLUMN "bankVerifiedAt" DATETIME;
ALTER TABLE "PaymentAttempt" ADD COLUMN "bankCheckCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaymentAttempt" ADD COLUMN "bankCheckedAt" DATETIME;
CREATE INDEX "PaymentAttempt_notifyAction_bankVerifiedAt_idx" ON "PaymentAttempt"("notifyAction", "bankVerifiedAt");
