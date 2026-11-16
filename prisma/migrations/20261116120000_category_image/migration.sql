-- Category photo uploaded from Admin → Категории (replaces editing the emoji).
-- Additive and nullable: existing categories keep all their data; the old
-- emoji in "icon" stays as the public fallback until a photo is uploaded.
ALTER TABLE "MenuCategory" ADD COLUMN "imageUrl" TEXT;
