/**
 * One-time (re-runnable) import of the menu from the JSON seed into the DB.
 *
 *   node scripts/import-menu-to-db.mjs
 *
 * Reads data/categories.json + data/pizza-pazzo-menu.json and UPSERTS by id,
 * preserving every cat_ / prod_ / var_ id and slug (old orders reference them;
 * slugs are public URLs). Idempotent: re-running syncs the DB rows back to the
 * seed values — which also means it OVERWRITES admin edits, so on production
 * it is run once after the first deploy (Render Shell) and afterwards only to
 * deliberately reset the menu to the seed.
 *
 * The JSON files stay in the repo as seed/backup; after this import the
 * database is the source of truth (admin edits live only there).
 *
 * `ingredients` is not migrated: no product in the seed has any, and the MVP
 * admin does not edit them. If they ever appear in the seed, extend the schema
 * first so the import cannot drop data silently.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const categories = JSON.parse(
  readFileSync(path.join(root, "data", "categories.json"), "utf8")
);
const products = JSON.parse(
  readFileSync(path.join(root, "data", "pizza-pazzo-menu.json"), "utf8")
);

const prisma = new PrismaClient();

function localized(text) {
  return { bg: text?.bg ?? "", en: text?.en ?? "" };
}

try {
  for (const c of categories) {
    const name = localized(c.name);
    const description = localized(c.description);
    const row = {
      slug: c.slug,
      nameBg: name.bg,
      nameEn: name.en,
      descriptionBg: description.bg,
      descriptionEn: description.en,
      icon: c.icon ?? null,
      sortOrder: c.sortOrder ?? 0,
      isActive: c.isActive ?? true,
    };
    await prisma.menuCategory.upsert({
      where: { id: c.id },
      create: { id: c.id, ...row },
      update: row,
    });
  }

  let variantCount = 0;
  for (const p of products) {
    const name = localized(p.name);
    const description = localized(p.description);
    const size = p.size ? localized(p.size) : null;
    const row = {
      slug: p.slug,
      nameBg: name.bg,
      nameEn: name.en,
      descriptionBg: description.bg,
      descriptionEn: description.en,
      categoryId: p.categoryId,
      priceBgn: p.priceBgn,
      priceEur: p.priceEur,
      imageUrl: p.imageUrl ?? null,
      allergens: JSON.stringify(p.allergens ?? []),
      allergensUnverified: p.allergensUnverified === true,
      sizeBg: size?.bg || null,
      sizeEn: size?.en || null,
      isAvailable: p.isAvailable ?? true,
      isPopular: p.isPopular === true,
      isNew: p.isNew === true,
      sortOrder: p.sortOrder ?? 0,
    };
    await prisma.menuProduct.upsert({
      where: { id: p.id },
      create: { id: p.id, ...row },
      update: row,
    });

    // Variants: sync to the seed — upsert each, drop ones the seed no longer has
    // (they may still be referenced from OrderItem.variantId, which is a plain
    // string snapshot, so deleting the menu row never breaks order history).
    const seedVariantIds = (p.variants ?? []).map((v) => v.id);
    await prisma.menuVariant.deleteMany({
      where: { productId: p.id, id: { notIn: seedVariantIds } },
    });
    for (const [i, v] of (p.variants ?? []).entries()) {
      const vName = localized(v.name);
      const vRow = {
        productId: p.id,
        nameBg: vName.bg,
        nameEn: vName.en,
        priceBgn: v.priceBgn,
        priceEur: v.priceEur,
        sortOrder: i,
      };
      await prisma.menuVariant.upsert({
        where: { id: v.id },
        create: { id: v.id, ...vRow },
        update: vRow,
      });
      variantCount++;
    }
  }

  const [catDb, prodDb, varDb, withVariants] = await Promise.all([
    prisma.menuCategory.count(),
    prisma.menuProduct.count(),
    prisma.menuVariant.count(),
    prisma.menuProduct.count({ where: { variants: { some: {} } } }),
  ]);
  console.log(
    `✔ imported ${categories.length} categories, ${products.length} products, ${variantCount} variants`
  );
  console.log(
    `  DB now has: ${catDb} categories, ${prodDb} products (${withVariants} with variants), ${varDb} variants`
  );
} finally {
  await prisma.$disconnect();
}
