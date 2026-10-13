-- The public contact e-mail is now info@bulgaria-digital-services.com.
--
-- The settings row is what the site actually renders (footer, contacts page,
-- legal pages, schema.org), so changing lib/constants.ts alone would not
-- reach production.
UPDATE "RestaurantSettings"
SET "contactEmail" = 'info@bulgaria-digital-services.com', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'restaurant';
