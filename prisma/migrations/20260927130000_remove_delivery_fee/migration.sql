-- Delivery is free (owner decision 2026-09-27): the fee is gone from the whole
-- site, so the column goes too. An order's total is now the sum of its items.
-- The column has no index or constraint, so SQLite drops it in place.
ALTER TABLE "Order" DROP COLUMN "deliveryFeeEur";
