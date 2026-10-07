-- Real-bank readiness (docs/UBB-VPOS-INTEGRATION.md). Purely additive:
-- existing orders, attempts, methods and statuses are not touched, and no
-- payment confirmation, refund or acknowledgement is invented for the past.

-- A provider page opened with a signed form POST (BORICA / UPC style).
ALTER TABLE "PaymentAttempt" ADD COLUMN "redirectFormJson" TEXT;

-- Staff acknowledgement of a payment alert (the alert itself stays).
ALTER TABLE "Order" ADD COLUMN "paymentAlertAckAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "paymentAlertAckBy" TEXT;

CREATE TABLE "PaymentAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAuditEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PaymentAuditEvent_orderId_idx" ON "PaymentAuditEvent"("orderId");
CREATE INDEX "PaymentAuditEvent_createdAt_idx" ON "PaymentAuditEvent"("createdAt");

CREATE TABLE "PaymentRefundRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bankReference" TEXT NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "recordedByEmail" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRefundRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentRefundRecord_idempotencyKey_key" ON "PaymentRefundRecord"("idempotencyKey");
CREATE INDEX "PaymentRefundRecord_orderId_idx" ON "PaymentRefundRecord"("orderId");
CREATE INDEX "PaymentRefundRecord_attemptId_idx" ON "PaymentRefundRecord"("attemptId");
