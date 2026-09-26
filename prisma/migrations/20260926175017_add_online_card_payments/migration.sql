-- Online card payments (hosted payment page + server-to-server confirmation).
--
-- The kitchen's view of an order (`status`) and the money (`paymentStatus`)
-- are now two separate columns. A card order is created unpaid and is NOT
-- released to the kitchen until the provider confirms the payment; a cash
-- order is released at checkout exactly as before.
--
-- Prisma redefines "Order" (SQLite cannot add UNIQUE columns in place). Every
-- existing column is copied by the INSERT … SELECT below, so no order, item or
-- sum is lost. The backfill at the END keeps existing orders behaving exactly
-- as they did: all of them were cash, all of them were already visible to the
-- kitchen, and all of them already produced their e-mail.

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "redirectUrl" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "providerStatus" TEXT,
    "providerResponse" TEXT,
    "failureReason" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'bg',
    "lastCheckedAt" DATETIME,
    "finalizedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentSimulatorSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "returnUrl" TEXT NOT NULL,
    "callbackUrl" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "resolveAt" DATETIME,
    "resolveTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" INTEGER NOT NULL,
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL DEFAULT 'Плевен',
    "deliveryNote" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH_ON_DELIVERY',
    "paymentStatus" TEXT NOT NULL DEFAULT 'CASH_DUE',
    "paidAt" DATETIME,
    "deliveryMethod" TEXT NOT NULL DEFAULT 'DELIVERY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "subtotalEur" DECIMAL NOT NULL,
    "deliveryFeeEur" DECIMAL NOT NULL DEFAULT 0,
    "totalEur" DECIMAL NOT NULL,
    "releasedToKitchenAt" DATETIME,
    "notificationSentAt" DATETIME,
    "accessToken" TEXT,
    "checkoutKey" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "paymentLockedUntil" DATETIME,
    "paymentAlert" TEXT,
    "estimatedTimeMinutes" INTEGER,
    "adminNote" TEXT,
    "acceptedAt" DATETIME,
    "cancelledAt" DATETIME,
    "completedAt" DATETIME,
    "anonymizedAt" DATETIME,
    "anonymizePending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("acceptedAt", "adminNote", "anonymizePending", "anonymizedAt", "cancelledAt", "completedAt", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryFeeEur", "deliveryMethod", "deliveryNote", "estimatedTimeMinutes", "id", "orderNumber", "paymentMethod", "status", "subtotalEur", "totalEur", "updatedAt", "userId") SELECT "acceptedAt", "adminNote", "anonymizePending", "anonymizedAt", "cancelledAt", "completedAt", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryFeeEur", "deliveryMethod", "deliveryNote", "estimatedTimeMinutes", "id", "orderNumber", "paymentMethod", "status", "subtotalEur", "totalEur", "updatedAt", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");
CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX "Order_releasedToKitchenAt_idx" ON "Order"("releasedToKitchenAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_reference_key" ON "PaymentAttempt"("reference");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_providerPaymentId_idx" ON "PaymentAttempt"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_idx" ON "PaymentAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSimulatorSession_reference_key" ON "PaymentSimulatorSession"("reference");

-- Backfill: every order that existed before this migration was a cash order
-- the kitchen could already see and the restaurant was already told about.
UPDATE "Order"
SET "paymentStatus" = 'CASH_DUE',
    "releasedToKitchenAt" = "createdAt",
    "notificationSentAt" = "createdAt"
WHERE "releasedToKitchenAt" IS NULL;
