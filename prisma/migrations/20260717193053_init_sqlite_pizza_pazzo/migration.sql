-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Основен адрес',
    "fullName" TEXT,
    "phone" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Варна',
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

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" INTEGER NOT NULL,
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL DEFAULT 'Варна',
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

-- CreateTable
CREATE TABLE "OrderItem" (
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
    "itemNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
