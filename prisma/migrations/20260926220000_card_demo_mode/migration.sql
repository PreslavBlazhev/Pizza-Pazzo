-- Card-payment demo on the live site, controlled from Admin → Settings.
--
-- OFF | STAFF | EVERYONE. The owner asked to keep testing the card flow
-- (payment simulator, no real money) on the real site after deploy, so it
-- starts as STAFF: signed-in staff/admins see "pay by card", customers do
-- not, and every such order is a test order that the kitchen must not cook.
-- ADD COLUMN in place — the row and every other setting stay as they are.

ALTER TABLE "RestaurantSettings" ADD COLUMN "cardDemoMode" TEXT NOT NULL DEFAULT 'OFF';
UPDATE "RestaurantSettings" SET "cardDemoMode" = 'STAFF' WHERE "id" = 'restaurant';
