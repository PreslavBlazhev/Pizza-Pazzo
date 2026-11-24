-- Free-text price shown instead of the number (e.g. "7.50/12.00"), typed in
-- Admin → Продукти → „Базова цена“. Additive and nullable: NULL means "show
-- priceEur as before". priceEur stays the number the basket charges.
ALTER TABLE "MenuProduct" ADD COLUMN "priceLabel" TEXT;
