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
    "deliveryMethod" TEXT NOT NULL DEFAULT 'DELIVERY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "subtotalBgn" DECIMAL NOT NULL,
    "subtotalEur" DECIMAL NOT NULL,
    "deliveryFeeBgn" DECIMAL NOT NULL DEFAULT 0,
    "deliveryFeeEur" DECIMAL NOT NULL DEFAULT 0,
    "totalBgn" DECIMAL NOT NULL,
    "totalEur" DECIMAL NOT NULL,
    "estimatedTimeMinutes" INTEGER,
    "adminNote" TEXT,
    "acceptedAt" DATETIME,
    "cancelledAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("acceptedAt", "adminNote", "cancelledAt", "completedAt", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryFeeBgn", "deliveryFeeEur", "deliveryMethod", "deliveryNote", "estimatedTimeMinutes", "id", "orderNumber", "paymentMethod", "status", "subtotalBgn", "subtotalEur", "totalBgn", "totalEur", "updatedAt", "userId") SELECT "acceptedAt", "adminNote", "cancelledAt", "completedAt", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryFeeBgn", "deliveryFeeEur", "deliveryMethod", "deliveryNote", "estimatedTimeMinutes", "id", "orderNumber", "paymentMethod", "status", "subtotalBgn", "subtotalEur", "totalBgn", "totalEur", "updatedAt", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE TABLE "new_UserAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Основен адрес',
    "fullName" TEXT,
    "phone" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Плевен',
    "addressLine" TEXT NOT NULL,
    "entrance" TEXT,
    "floor" TEXT,
    "apartment" TEXT,
    "deliveryNote" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserAddress" ("addressLine", "apartment", "city", "createdAt", "deliveryNote", "entrance", "floor", "fullName", "id", "isDefault", "label", "phone", "updatedAt", "userId") SELECT "addressLine", "apartment", "city", "createdAt", "deliveryNote", "entrance", "floor", "fullName", "id", "isDefault", "label", "phone", "updatedAt", "userId" FROM "UserAddress";
DROP TABLE "UserAddress";
ALTER TABLE "new_UserAddress" RENAME TO "UserAddress";
CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
