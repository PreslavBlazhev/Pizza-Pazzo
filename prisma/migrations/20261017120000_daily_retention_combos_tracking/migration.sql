-- Daily retention, two-pizza combos, grouped tickets, e-mail outbox (2026-10-17).
--
-- Additive only: new columns get defaults, new tables start empty except the
-- two single-row tables, which are seeded here so a production deploy needs
-- no seed step. No order row is changed or deleted by this migration — old
-- orders are removed by the application (lib/order-purge.ts) at the first run
-- of the maintenance job after the deploy.

-- Order: the combo snapshot.
ALTER TABLE "Order" ADD COLUMN "offerJson" TEXT NOT NULL DEFAULT '[]';

-- OrderItem: the line's share of the discount + the category snapshot.
ALTER TABLE "OrderItem" ADD COLUMN "discountEur" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "categoryNameBg" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "categoryNameEn" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "categorySortOrder" INTEGER;

-- The order-number counter continues from the highest number ever issued.
CREATE TABLE "OrderSequence" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'order',
    "lastNumber" INTEGER NOT NULL
);
INSERT INTO "OrderSequence" ("id", "lastNumber")
SELECT 'order', COALESCE(MAX("orderNumber"), 1000) FROM "Order";

CREATE TABLE "MaintenanceState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastRunAt" DATETIME,
    "lastCutoffAt" DATETIME,
    "lastDeleted" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "MaintenanceState" ("id", "lastDeleted", "updatedAt")
VALUES ('orders', 0, CURRENT_TIMESTAMP);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    "lastError" TEXT,
    "lastErrorKind" TEXT,
    "providerMessageId" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailOutbox_dedupeKey_key" ON "EmailOutbox"("dedupeKey");
CREATE INDEX "EmailOutbox_orderId_idx" ON "EmailOutbox"("orderId");
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");
