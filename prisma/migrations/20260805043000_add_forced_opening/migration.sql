-- Forced opening ("Отвори принудително") on the single RestaurantSettings row.
--
-- The mirror of the manual closure added in 20260804103000: that one can only
-- close a shop the hours say is open, this one can only open a shop the hours
-- say is closed. Both are read-time decisions — an expired `openUntil` simply
-- stops counting, exactly like an expired `closedUntil`, so no job has to
-- clear anything and the shop can never get stuck open because a write failed.
--
-- Plain ADD COLUMN again: every column is nullable or has a default, the one
-- shape SQLite can add in place, so the existing row survives untouched and
-- this is safe under `migrate deploy` on Render.
--
-- No backfill: `manuallyOpen = false` is the behaviour the site has had until
-- now — the opening hours alone decide.

ALTER TABLE "RestaurantSettings" ADD COLUMN "manuallyOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantSettings" ADD COLUMN "openUntil" DATETIME;
ALTER TABLE "RestaurantSettings" ADD COLUMN "openedAt" DATETIME;
ALTER TABLE "RestaurantSettings" ADD COLUMN "openedByEmail" TEXT;
