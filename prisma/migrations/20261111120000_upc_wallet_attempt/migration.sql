-- Google Pay / Apple Pay through UPC payByWallet. A wallet payment reuses the
-- attempt's signed identity (OrderID + PurchaseTime + amount), so these only
-- record that the attempt was submitted from a wallet — never the token.
ALTER TABLE "PaymentAttempt" ADD COLUMN "walletType" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "walletSubmittedAt" DATETIME;
ALTER TABLE "PaymentAttempt" ADD COLUMN "walletSubmissions" INTEGER NOT NULL DEFAULT 0;
