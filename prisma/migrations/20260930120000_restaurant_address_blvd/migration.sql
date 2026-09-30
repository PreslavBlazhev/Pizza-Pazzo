-- The restaurant (обект) is on a BOULEVARD: the BFSA register (рег. № 152700478,
-- „бул.”Георги Кочев”, № 13“) and the owner's own site both say "бул.".
-- Only the exact value the site shipped with is corrected; an address the
-- owner has since edited in Admin → Settings is left alone.
UPDATE "RestaurantSettings"
SET "addressBg" = 'Плевен, бул. „Георги Кочев“ 13 (срещу Технополис)'
WHERE "addressBg" = 'Плевен, ул. Георги Кочев 13 (Срещу Технополис)';

UPDATE "RestaurantSettings"
SET "addressEn" = '13 Georgi Kochev Blvd., Pleven (opposite Technopolis)'
WHERE "addressEn" = '13 Georgi Kochev St., Pleven (opposite Technopolis)';
