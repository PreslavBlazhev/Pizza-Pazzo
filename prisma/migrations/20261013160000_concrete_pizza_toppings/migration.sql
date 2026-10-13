-- The owner's 39 concrete pizza toppings (2026-10-13) replace the four
-- generic choices ("Месна / Млечна / Рибна / Зеленчукова добавка").
--
-- Each topping is its own product in "Пица добавки" with a 30 см and a 40 см
-- variant, so the admin can reprice, rename or switch off one ingredient
-- (Admin → Продукти). Prices are per ONE topping on ONE pizza of that size:
--   15 vegetable          2.05 € (30 см) / 2.56 € (40 см)
--   24 meat/dairy/fish    2.56 € (30 см) / 3.07 € (40 см)
-- No allergens are invented: the rows start with an empty list and
-- allergensUnverified = true until the kitchen confirms them.
--
-- On a brand-new database (no menu imported yet) every statement is a no-op;
-- scripts/import-menu-to-db.mjs then creates the same rows from the seed.
--
-- Idempotent and non-destructive: INSERT OR IGNORE never duplicates a row and
-- never overwrites an admin edit, so running it twice changes nothing. No
-- order, customer or other product is touched.
--
-- The two generic products stay in the database (old orders name them) but
-- are switched off; the site no longer offers or accepts them.

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_chervena_chushka', 'topping-chervena-chushka', 'Червена чушка', 'Red pepper', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_chervena_chushka_30', 'prod_topping_chervena_chushka', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_chervena_chushka');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_chervena_chushka_40', 'prod_topping_chervena_chushka', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_chervena_chushka');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_zelena_chushka', 'topping-zelena-chushka', 'Зелена чушка', 'Green pepper', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 11, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_zelena_chushka_30', 'prod_topping_zelena_chushka', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_zelena_chushka');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_zelena_chushka_40', 'prod_topping_zelena_chushka', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_zelena_chushka');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_pechena_chushka', 'topping-pechena-chushka', 'Печена чушка', 'Roasted pepper', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 12, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pechena_chushka_30', 'prod_topping_pechena_chushka', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pechena_chushka');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pechena_chushka_40', 'prod_topping_pechena_chushka', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pechena_chushka');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_gabi', 'topping-gabi', 'Гъби', 'Mushrooms', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 13, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_gabi_30', 'prod_topping_gabi', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_gabi');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_gabi_40', 'prod_topping_gabi', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_gabi');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_tsarevitsa', 'topping-tsarevitsa', 'Царевица', 'Sweetcorn', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 14, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_tsarevitsa_30', 'prod_topping_tsarevitsa', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_tsarevitsa');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_tsarevitsa_40', 'prod_topping_tsarevitsa', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_tsarevitsa');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_halapenyos', 'topping-halapenyos', 'Халапеньос', 'Jalapeños', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 15, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_halapenyos_30', 'prod_topping_halapenyos', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_halapenyos');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_halapenyos_40', 'prod_topping_halapenyos', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_halapenyos');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_cherven_luk', 'topping-cherven-luk', 'Червен лук', 'Red onion', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 16, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_cherven_luk_30', 'prod_topping_cherven_luk', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_cherven_luk');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_cherven_luk_40', 'prod_topping_cherven_luk', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_cherven_luk');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_cheri_domati', 'topping-cheri-domati', 'Чери домати', 'Cherry tomatoes', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 17, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_cheri_domati_30', 'prod_topping_cheri_domati', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_cheri_domati');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_cheri_domati_40', 'prod_topping_cheri_domati', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_cheri_domati');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_domati', 'topping-domati', 'Домати', 'Tomatoes', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 18, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_domati_30', 'prod_topping_domati', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_domati');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_domati_40', 'prod_topping_domati', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_domati');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_rukola', 'topping-rukola', 'Рукола', 'Rocket', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 19, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_rukola_30', 'prod_topping_rukola', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_rukola');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_rukola_40', 'prod_topping_rukola', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_rukola');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_maslini', 'topping-maslini', 'Маслини', 'Olives', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_maslini_30', 'prod_topping_maslini', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_maslini');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_maslini_40', 'prod_topping_maslini', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_maslini');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_bosilek', 'topping-bosilek', 'Босилек', 'Basil', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 21, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_bosilek_30', 'prod_topping_bosilek', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_bosilek');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_bosilek_40', 'prod_topping_bosilek', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_bosilek');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_ananas', 'topping-ananas', 'Ананас', 'Pineapple', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 22, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_ananas_30', 'prod_topping_ananas', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_ananas');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_ananas_40', 'prod_topping_ananas', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_ananas');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_kiseli_krastavichki', 'topping-kiseli-krastavichki', 'Кисели краставички', 'Gherkins', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 23, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_kiseli_krastavichki_30', 'prod_topping_kiseli_krastavichki', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_kiseli_krastavichki');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_kiseli_krastavichki_40', 'prod_topping_kiseli_krastavichki', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_kiseli_krastavichki');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_susheni_domati', 'topping-susheni-domati', 'Сушени домати', 'Sun-dried tomatoes', 'зеленчукови добавки', 'vegetable toppings', 'cat_pizza_addons', 2.05, NULL, '[]', true, NULL, NULL, true, false, false, 24, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_susheni_domati_30', 'prod_topping_susheni_domati', '30 см', '30 cm', 2.05, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_susheni_domati');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_susheni_domati_40', 'prod_topping_susheni_domati', '40 см', '40 cm', 2.56, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_susheni_domati');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_pileshka_shunka', 'topping-pileshka-shunka', 'Пилешка шунка', 'Chicken ham', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 25, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pileshka_shunka_30', 'prod_topping_pileshka_shunka', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pileshka_shunka');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pileshka_shunka_40', 'prod_topping_pileshka_shunka', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pileshka_shunka');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_svinska_shunka', 'topping-svinska-shunka', 'Свинска шунка', 'Pork ham', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 26, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_svinska_shunka_30', 'prod_topping_svinska_shunka', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_svinska_shunka');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_svinska_shunka_40', 'prod_topping_svinska_shunka', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_svinska_shunka');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_pikantno_teleshko', 'topping-pikantno-teleshko', 'Пикантно телешко', 'Spicy beef', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 27, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pikantno_teleshko_30', 'prod_topping_pikantno_teleshko', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pikantno_teleshko');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pikantno_teleshko_40', 'prod_topping_pikantno_teleshko', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pikantno_teleshko');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_peperoni', 'topping-peperoni', 'Пеперони', 'Pepperoni', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 28, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_peperoni_30', 'prod_topping_peperoni', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_peperoni');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_peperoni_40', 'prod_topping_peperoni', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_peperoni');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_shpek', 'topping-shpek', 'Шпек', 'Speck', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 29, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_shpek_30', 'prod_topping_shpek', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_shpek');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_shpek_40', 'prod_topping_shpek', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_shpek');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_lukanka', 'topping-lukanka', 'Луканка', 'Lukanka (cured sausage)', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_lukanka_30', 'prod_topping_lukanka', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_lukanka');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_lukanka_40', 'prod_topping_lukanka', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_lukanka');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_krenvirsh', 'topping-krenvirsh', 'Кренвирш', 'Frankfurter', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 31, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_krenvirsh_30', 'prod_topping_krenvirsh', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_krenvirsh');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_krenvirsh_40', 'prod_topping_krenvirsh', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_krenvirsh');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_bekon', 'topping-bekon', 'Бекон', 'Bacon', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 32, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_bekon_30', 'prod_topping_bekon', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_bekon');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_bekon_40', 'prod_topping_bekon', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_bekon');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_teleshki_burger', 'topping-teleshki-burger', 'Телешки бургер', 'Beef burger', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 33, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_teleshki_burger_30', 'prod_topping_teleshki_burger', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_teleshki_burger');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_teleshki_burger_40', 'prod_topping_teleshki_burger', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_teleshki_burger');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_yaytse', 'topping-yaytse', 'Яйце', 'Egg', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 34, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_yaytse_30', 'prod_topping_yaytse', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_yaytse');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_yaytse_40', 'prod_topping_yaytse', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_yaytse');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_racheshki_rultsa', 'topping-racheshki-rultsa', 'Рачешки рулца', 'Crab sticks', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 35, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_racheshki_rultsa_30', 'prod_topping_racheshki_rultsa', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_racheshki_rultsa');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_racheshki_rultsa_40', 'prod_topping_racheshki_rultsa', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_racheshki_rultsa');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_riba_ton', 'topping-riba-ton', 'Риба тон', 'Tuna', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 36, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_riba_ton_30', 'prod_topping_riba_ton', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_riba_ton');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_riba_ton_40', 'prod_topping_riba_ton', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_riba_ton');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_anshoa', 'topping-anshoa', 'Аншоа', 'Anchovies', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 37, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_anshoa_30', 'prod_topping_anshoa', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_anshoa');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_anshoa_40', 'prod_topping_anshoa', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_anshoa');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_kashkaval', 'topping-kashkaval', 'Кашкавал', 'Kashkaval (yellow cheese)', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 38, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_kashkaval_30', 'prod_topping_kashkaval', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_kashkaval');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_kashkaval_40', 'prod_topping_kashkaval', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_kashkaval');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_krave_sirene', 'topping-krave-sirene', 'Краве сирене', 'White cheese (cow’s milk)', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 39, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_krave_sirene_30', 'prod_topping_krave_sirene', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_krave_sirene');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_krave_sirene_40', 'prod_topping_krave_sirene', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_krave_sirene');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_motsarela', 'topping-motsarela', 'Моцарела', 'Mozzarella', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 40, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_motsarela_30', 'prod_topping_motsarela', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_motsarela');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_motsarela_40', 'prod_topping_motsarela', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_motsarela');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_sinyo_sirene', 'topping-sinyo-sirene', 'Синьо сирене', 'Blue cheese', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 41, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_sinyo_sirene_30', 'prod_topping_sinyo_sirene', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_sinyo_sirene');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_sinyo_sirene_40', 'prod_topping_sinyo_sirene', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_sinyo_sirene');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_grana_padano', 'topping-grana-padano', 'Грана падано', 'Grana Padano', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 42, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_grana_padano_30', 'prod_topping_grana_padano', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_grana_padano');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_grana_padano_40', 'prod_topping_grana_padano', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_grana_padano');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_topeno_sirene', 'topping-topeno-sirene', 'Топено сирене', 'Processed cheese', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 43, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_topeno_sirene_30', 'prod_topping_topeno_sirene', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_topeno_sirene');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_topeno_sirene_40', 'prod_topping_topeno_sirene', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_topeno_sirene');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_filadelfiya', 'topping-filadelfiya', 'Филаделфия', 'Philadelphia', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 44, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_filadelfiya_30', 'prod_topping_filadelfiya', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_filadelfiya');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_filadelfiya_40', 'prod_topping_filadelfiya', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_filadelfiya');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_chedar', 'topping-chedar', 'Чедър', 'Cheddar', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 45, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_chedar_30', 'prod_topping_chedar', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_chedar');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_chedar_40', 'prod_topping_chedar', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_chedar');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_pushena_syomga', 'topping-pushena-syomga', 'Пушена сьомга', 'Smoked salmon', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 46, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pushena_syomga_30', 'prod_topping_pushena_syomga', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pushena_syomga');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_pushena_syomga_40', 'prod_topping_pushena_syomga', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_pushena_syomga');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_gauda', 'topping-gauda', 'Гауда', 'Gouda', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 47, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_gauda_30', 'prod_topping_gauda', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_gauda');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_gauda_40', 'prod_topping_gauda', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_gauda');

INSERT OR IGNORE INTO "MenuProduct" ("id", "slug", "nameBg", "nameEn", "descriptionBg", "descriptionEn", "categoryId", "priceEur", "imageUrl", "allergens", "allergensUnverified", "sizeBg", "sizeEn", "isAvailable", "isPopular", "isNew", "sortOrder", "createdAt", "updatedAt")
SELECT 'prod_topping_emental', 'topping-emental', 'Ементал', 'Emmental', 'месни / млечни / рибни добавки', 'meat / dairy / fish toppings', 'cat_pizza_addons', 2.56, NULL, '[]', true, NULL, NULL, true, false, false, 48, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM "MenuCategory" WHERE "id" = 'cat_pizza_addons');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_emental_30', 'prod_topping_emental', '30 см', '30 cm', 2.56, 0
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_emental');
INSERT OR IGNORE INTO "MenuVariant" ("id", "productId", "nameBg", "nameEn", "priceEur", "sortOrder")
SELECT 'var_topping_emental_40', 'prod_topping_emental', '40 см', '40 cm', 3.07, 1
WHERE EXISTS (SELECT 1 FROM "MenuProduct" WHERE "id" = 'prod_topping_emental');

-- The retired generic toppings: kept for history, no longer on sale.
UPDATE "MenuProduct" SET "isAvailable" = false, "updatedAt" = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE "id" IN ('prod_mesni_mlechni_ribni', 'prod_zelenchukovi');
