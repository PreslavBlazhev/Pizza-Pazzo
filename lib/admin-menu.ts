/**
 * Admin reads for the menu — SERVER ONLY.
 *
 * Unlike `lib/menu-data.ts` (cached, locale-resolved, public), the admin needs
 * BOTH languages of every field and must see its own edits immediately, so
 * these queries go straight to Prisma with no cache. Writes live in
 * `app/actions/admin-menu.ts`, which revalidates the public cache tag.
 */
import { db } from "@/lib/db";

export interface AdminMenuVariant {
  id: string;
  nameBg: string;
  nameEn: string;
  priceBgn: number;
  priceEur: number;
}

export interface AdminMenuProduct {
  id: string;
  slug: string;
  nameBg: string;
  nameEn: string;
  descriptionBg: string;
  descriptionEn: string;
  categoryId: string;
  priceBgn: number;
  priceEur: number;
  imageUrl: string | null;
  allergens: string[];
  allergensUnverified: boolean;
  sizeBg: string | null;
  sizeEn: string | null;
  isAvailable: boolean;
  isPopular: boolean;
  isNew: boolean;
  sortOrder: number;
  variants: AdminMenuVariant[];
}

export interface AdminMenuCategory {
  id: string;
  slug: string;
  nameBg: string;
  nameEn: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

type ProductRow = Awaited<
  ReturnType<typeof db.menuProduct.findMany<{ include: { variants: true } }>>
>[number];

function toAdminProduct(row: ProductRow): AdminMenuProduct {
  let allergens: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.allergens);
    if (Array.isArray(parsed)) allergens = parsed.filter((a) => typeof a === "string");
  } catch {
    // unreadable JSON → shown as "no allergens set"; the edit form rewrites it
  }
  return {
    id: row.id,
    slug: row.slug,
    nameBg: row.nameBg,
    nameEn: row.nameEn,
    descriptionBg: row.descriptionBg,
    descriptionEn: row.descriptionEn,
    categoryId: row.categoryId,
    priceBgn: Number(row.priceBgn),
    priceEur: Number(row.priceEur),
    imageUrl: row.imageUrl,
    allergens,
    allergensUnverified: row.allergensUnverified,
    sizeBg: row.sizeBg,
    sizeEn: row.sizeEn,
    isAvailable: row.isAvailable,
    isPopular: row.isPopular,
    isNew: row.isNew,
    sortOrder: row.sortOrder,
    variants: [...row.variants]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
        id: v.id,
        nameBg: v.nameBg,
        nameEn: v.nameEn,
        priceBgn: Number(v.priceBgn),
        priceEur: Number(v.priceEur),
      })),
  };
}

/** All products (including unavailable ones), category order then sortOrder. */
export async function getAdminProducts(): Promise<AdminMenuProduct[]> {
  const [categories, products] = await Promise.all([
    db.menuCategory.findMany({ select: { id: true, sortOrder: true } }),
    db.menuProduct.findMany({
      include: { variants: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const order = new Map(categories.map((c) => [c.id, c.sortOrder]));
  return products
    .sort(
      (a, b) =>
        (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) ||
        a.sortOrder - b.sortOrder
    )
    .map(toAdminProduct);
}

export async function getAdminProduct(
  id: string
): Promise<AdminMenuProduct | null> {
  const row = await db.menuProduct.findUnique({
    where: { id },
    include: { variants: true },
  });
  return row ? toAdminProduct(row) : null;
}

/** All categories (including inactive), sorted, with product counts. */
export async function getAdminCategories(): Promise<AdminMenuCategory[]> {
  const rows = await db.menuCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    nameBg: row.nameBg,
    nameEn: row.nameEn,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount: row._count.products,
  }));
}
