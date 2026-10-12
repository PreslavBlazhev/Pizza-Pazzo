-- „Грешна математика“ (owner's rules, 2026-10-12): an order may carry the
-- two-pizza combo discount. totalEur = subtotalEur − discountEur.
-- Existing orders had no discount, so they get 0 and keep their totals.
ALTER TABLE "Order" ADD COLUMN "discountEur" DECIMAL NOT NULL DEFAULT 0;
