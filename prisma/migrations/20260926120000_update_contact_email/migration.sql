-- The public contact e-mail is now pr2.blazhev@gmail.com.
--
-- The settings row was seeded with the previous address and is what the site
-- actually renders (footer, contacts page, legal pages, schema.org), so
-- changing lib/constants.ts alone would not reach production.
UPDATE "RestaurantSettings"
SET "contactEmail" = 'pr2.blazhev@gmail.com', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'restaurant';
