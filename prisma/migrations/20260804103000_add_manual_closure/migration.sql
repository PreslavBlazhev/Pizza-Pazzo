-- Manual closure ("Затвори заведението") on the single RestaurantSettings row.
--
-- Plain ADD COLUMN rather than Prisma's RedefineTables dance: every new column
-- is either nullable or has a default, which is exactly the case SQLite can
-- add in place. That keeps the existing row (address, phones, opening hours)
-- untouched and makes this safe to run with `migrate deploy` on Render.
--
-- No backfill is needed: `manuallyClosed = false` is "заведението работи", the
-- state the site has had until now.

ALTER TABLE "RestaurantSettings" ADD COLUMN "manuallyClosed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantSettings" ADD COLUMN "closedUntil" DATETIME;
ALTER TABLE "RestaurantSettings" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "RestaurantSettings" ADD COLUMN "closedByEmail" TEXT;
