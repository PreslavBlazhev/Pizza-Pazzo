-- Remove the BGN (лв.) currency from the whole system — the euro is now the
-- only currency stored and displayed. Dropped columns:
--   MenuProduct.priceBgn, MenuVariant.priceBgn
--   Order.subtotalBgn, Order.deliveryFeeBgn, Order.totalBgn
--   OrderItem.unitPriceBgn, OrderItem.totalPriceBgn
-- Every remaining column (including the euro amounts of existing orders) is
-- carried over unchanged by the table rebuilds below.
--
-- Note: OrderItem.extrasJson snapshots written before this migration still
-- contain unitPriceBgn/totalPriceBgn keys. They are simply ignored when parsed
-- (lib/extras-rules.ts no longer validates or reads them), so no data rewrite
-- is needed and old orders stay readable.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MenuProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "nameBg" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionBg" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT NOT NULL,
    "priceEur" DECIMAL NOT NULL,
    "imageUrl" TEXT,
    "allergens" TEXT NOT NULL DEFAULT '[]',
    "allergensUnverified" BOOLEAN NOT NULL DEFAULT false,
    "sizeBg" TEXT,
    "sizeEn" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MenuProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MenuProduct" ("allergens", "allergensUnverified", "categoryId", "createdAt", "descriptionBg", "descriptionEn", "id", "imageUrl", "isAvailable", "isNew", "isPopular", "nameBg", "nameEn", "priceEur", "sizeBg", "sizeEn", "slug", "sortOrder", "updatedAt") SELECT "allergens", "allergensUnverified", "categoryId", "createdAt", "descriptionBg", "descriptionEn", "id", "imageUrl", "isAvailable", "isNew", "isPopular", "nameBg", "nameEn", "priceEur", "sizeBg", "sizeEn", "slug", "sortOrder", "updatedAt" FROM "MenuProduct";
DROP TABLE "MenuProduct";
ALTER TABLE "new_MenuProduct" RENAME TO "MenuProduct";
CREATE UNIQUE INDEX "MenuProduct_slug_key" ON "MenuProduct"("slug");
CREATE INDEX "MenuProduct_categoryId_idx" ON "MenuProduct"("categoryId");
CREATE TABLE "new_MenuVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "nameBg" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "priceEur" DECIMAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MenuVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MenuProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MenuVariant" ("id", "nameBg", "nameEn", "priceEur", "productId", "sortOrder") SELECT "id", "nameBg", "nameEn", "priceEur", "productId", "sortOrder" FROM "MenuVariant";
DROP TABLE "MenuVariant";
ALTER TABLE "new_MenuVariant" RENAME TO "MenuVariant";
CREATE INDEX "MenuVariant_productId_idx" ON "MenuVariant"("productId");
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
    "subtotalEur" DECIMAL NOT NULL,
    "deliveryFeeEur" DECIMAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_Order" ("acceptedAt", "adminNote", "cancelledAt", "completedAt", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryFeeEur", "deliveryMethod", "deliveryNote", "estimatedTimeMinutes", "id", "orderNumber", "paymentMethod", "status", "subtotalEur", "totalEur", "updatedAt", "userId") SELECT "acceptedAt", "adminNote", "cancelledAt", "completedAt", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryFeeEur", "deliveryMethod", "deliveryNote", "estimatedTimeMinutes", "id", "orderNumber", "paymentMethod", "status", "subtotalEur", "totalEur", "updatedAt", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSlug" TEXT,
    "productNameBg" TEXT NOT NULL,
    "productNameEn" TEXT,
    "productImageUrl" TEXT,
    "variantId" TEXT,
    "variantName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceEur" DECIMAL NOT NULL,
    "totalPriceEur" DECIMAL NOT NULL,
    "extrasJson" TEXT NOT NULL DEFAULT '[]',
    "itemNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("createdAt", "extrasJson", "id", "itemNote", "orderId", "productId", "productImageUrl", "productNameBg", "productNameEn", "productSlug", "quantity", "totalPriceEur", "unitPriceEur", "variantId", "variantName") SELECT "createdAt", "extrasJson", "id", "itemNote", "orderId", "productId", "productImageUrl", "productNameBg", "productNameEn", "productSlug", "quantity", "totalPriceEur", "unitPriceEur", "variantId", "variantName" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
