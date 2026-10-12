-- Owner's corrections, 2026-10-12.
--
-- 1. ONE public phone: 064 801 999 (tel:+35964801999). The owner confirmed it
--    as the restaurant's number; the older "+359 88 248 4777" contradicted it
--    and is no longer published anywhere. The second slot is emptied, so the
--    site never shows two numbers again.
UPDATE "RestaurantSettings"
SET "primaryPhone" = '064 801 999',
    "secondaryPhone" = NULL;

-- 2. Opening hours 11:00 – 22:30. Only the TIMES change: a day that is open
--    stays open and takes the new hours; a day the owner had marked closed in
--    Admin → Settings stays closed. No new working days are invented here.
UPDATE "RestaurantSettings" SET "mondayFrom" = '11:00', "mondayTo" = '22:30' WHERE "mondayOpen" = 1;
UPDATE "RestaurantSettings" SET "tuesdayFrom" = '11:00', "tuesdayTo" = '22:30' WHERE "tuesdayOpen" = 1;
UPDATE "RestaurantSettings" SET "wednesdayFrom" = '11:00', "wednesdayTo" = '22:30' WHERE "wednesdayOpen" = 1;
UPDATE "RestaurantSettings" SET "thursdayFrom" = '11:00', "thursdayTo" = '22:30' WHERE "thursdayOpen" = 1;
UPDATE "RestaurantSettings" SET "fridayFrom" = '11:00', "fridayTo" = '22:30' WHERE "fridayOpen" = 1;
UPDATE "RestaurantSettings" SET "saturdayFrom" = '11:00', "saturdayTo" = '22:30' WHERE "saturdayOpen" = 1;
UPDATE "RestaurantSettings" SET "sundayFrom" = '11:00', "sundayTo" = '22:30' WHERE "sundayOpen" = 1;

-- 3. The pizzas are not wood-fired (owner, 2026-10-12): the standard-pizza
--    category description loses "на дърва" / "wood-fired". Only the exact
--    text the site shipped with is changed; an admin edit is left alone.
UPDATE "MenuCategory"
SET "descriptionBg" = 'Класически пици в два размера — 30 и 40 см.'
WHERE "id" = 'cat_pizzas_standard'
  AND "descriptionBg" = 'Класически пици на дърва в два размера — 30 и 40 см.';

UPDATE "MenuCategory"
SET "descriptionEn" = 'Classic pizzas in two sizes — 30 and 40 cm.'
WHERE "id" = 'cat_pizzas_standard'
  AND "descriptionEn" = 'Classic wood-fired pizzas in two sizes — 30 and 40 cm.';

-- 4. The English menu is British English (owner, 2026-10-12): "French fries"
--    → "Chips", "pickles" → "gherkins". Only the English columns are touched,
--    and REPLACE leaves any text without those words exactly as it is.
UPDATE "MenuProduct" SET "nameEn" = REPLACE("nameEn", 'French fries', 'Chips');
UPDATE "MenuProduct" SET "descriptionEn" = REPLACE("descriptionEn", 'pickles', 'gherkins');
UPDATE "MenuProduct" SET "sizeEn" = REPLACE("sizeEn", 'with fries 100 g', 'with 100 g of chips')
WHERE "sizeEn" IS NOT NULL;
UPDATE "MenuCategory" SET "descriptionEn" = REPLACE("descriptionEn", 'served with fries', 'served with chips');
