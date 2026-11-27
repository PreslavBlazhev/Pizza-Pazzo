-- Gallery photos, editable from Admin → Галерия (were hard-coded in
-- data/gallery.json). Seeded with the same placeholder tiles so the public
-- section looks exactly as before until the owner replaces them.
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT NOT NULL,
    "captionBg" TEXT NOT NULL,
    "captionEn" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "GalleryImage_sortOrder_idx" ON "GalleryImage"("sortOrder");

INSERT INTO "GalleryImage" ("id", "imageUrl", "captionBg", "captionEn", "sortOrder", "createdAt", "updatedAt") VALUES ('seed_gallery_g1', '/images/products/placeholder-pizza.svg', 'Пица', 'Pizza', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "GalleryImage" ("id", "imageUrl", "captionBg", "captionEn", "sortOrder", "createdAt", "updatedAt") VALUES ('seed_gallery_g3', '/images/products/placeholder-salad.svg', 'Салата', 'Salad', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "GalleryImage" ("id", "imageUrl", "captionBg", "captionEn", "sortOrder", "createdAt", "updatedAt") VALUES ('seed_gallery_g4', '/images/products/placeholder-dessert.svg', 'Десерт', 'Dessert', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "GalleryImage" ("id", "imageUrl", "captionBg", "captionEn", "sortOrder", "createdAt", "updatedAt") VALUES ('seed_gallery_g5', '/images/products/placeholder-pizza.svg', 'Пеперони Макс', 'Pepperoni Max', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "GalleryImage" ("id", "imageUrl", "captionBg", "captionEn", "sortOrder", "createdAt", "updatedAt") VALUES ('seed_gallery_g6', '/images/products/placeholder-food.svg', 'Ястие от менюто', 'From the menu', 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "GalleryImage" ("id", "imageUrl", "captionBg", "captionEn", "sortOrder", "createdAt", "updatedAt") VALUES ('seed_gallery_g7', '/images/products/placeholder-drink.svg', 'Напитка', 'Drink', 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "GalleryImage" ("id", "imageUrl", "captionBg", "captionEn", "sortOrder", "createdAt", "updatedAt") VALUES ('seed_gallery_g8', '/images/products/placeholder-pizza.svg', 'Маргарита', 'Margherita', 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
