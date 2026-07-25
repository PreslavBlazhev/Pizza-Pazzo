-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "unitPriceBgn" DECIMAL NOT NULL,
    "unitPriceEur" DECIMAL NOT NULL,
    "totalPriceBgn" DECIMAL NOT NULL,
    "totalPriceEur" DECIMAL NOT NULL,
    "extrasJson" TEXT NOT NULL DEFAULT '[]',
    "itemNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("createdAt", "id", "itemNote", "orderId", "productId", "productImageUrl", "productNameBg", "productNameEn", "productSlug", "quantity", "totalPriceBgn", "totalPriceEur", "unitPriceBgn", "unitPriceEur", "variantId", "variantName") SELECT "createdAt", "id", "itemNote", "orderId", "productId", "productImageUrl", "productNameBg", "productNameEn", "productSlug", "quantity", "totalPriceBgn", "totalPriceEur", "unitPriceBgn", "unitPriceEur", "variantId", "variantName" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
