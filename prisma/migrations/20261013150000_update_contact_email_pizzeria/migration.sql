-- The pizzeria's own mailbox, pizzapazzopln@gmail.com, is now the public
-- contact e-mail (owner's request, 2026-10-13). It replaces the developer's
-- address (info@bulgaria-digital-services.com) that was shown until now.
--
-- The settings row is what the site actually renders (footer, contacts page,
-- legal pages, schema.org, the customer's "order accepted" e-mail and its
-- Reply-To), so changing lib/constants.ts alone would not reach production.
-- Only the e-mail column is touched; it is idempotent.
UPDATE "RestaurantSettings"
SET "contactEmail" = 'pizzapazzopln@gmail.com', "updatedAt" = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE "id" = 'restaurant';
