"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { MENU_CACHE_TAG } from "@/lib/menu-data";
import {
  deleteCategoryImageIfUnused,
  discardCategoryImage,
  saveCategoryImage,
} from "@/lib/uploads/category-image-storage";
import { ImageProcessingError, normalizeCategoryImage } from "@/lib/uploads/image-processing";
import { isPersistentUploadsConfigured } from "@/lib/uploads/paths";
import { deleteProductImageIfUnused } from "@/lib/uploads/product-image-storage";
import { validateCategoryImageUpload } from "@/lib/uploads/validate";
import { latinSlug } from "@/lib/utils";
import {
  categoryUpdateSchema,
  productUpdateSchema,
  variantUpdateSchema,
} from "@/lib/validators/admin-menu";
import type { ActionResult } from "@/types/auth";

/**
 * Admin menu writes. Roles follow docs/admin-menu-db-plan.md:
 *   - availability toggle → STAFF+ (the daily "sold out" case)
 *   - everything else (prices, names, categories) → ADMIN+
 *
 * Every successful write revalidates MENU_CACHE_TAG, which is the ONLY cache
 * in front of the public menu (lib/menu-data.ts) — so the site updates
 * immediately, and /admin/products (uncached reads) via revalidatePath.
 *
 * Slugs and ids are deliberately not editable (public URLs + order history).
 */

function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function revalidateMenu(): void {
  updateTag(MENU_CACHE_TAG);
  revalidatePath("/admin/products");
  revalidatePath("/admin/categories");
}

/** STAFF+: quick flip used straight from the products list. */
export async function toggleProductAvailabilityAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("productId") ?? "");
  const product = await db.menuProduct.findUnique({
    where: { id },
    select: { isAvailable: true, nameBg: true },
  });
  if (!product) return { ok: false, error: "Продуктът не беше намерен." };

  await db.menuProduct.update({
    where: { id },
    data: { isAvailable: !product.isAvailable },
  });

  revalidateMenu();
  return {
    ok: true,
    message: product.isAvailable
      ? `„${product.nameBg}“ е скрит от менюто.`
      : `„${product.nameBg}“ отново е наличен.`,
  };
}

/** The product form's fields, as posted by ProductForm (create and edit). */
function parseProductForm(formData: FormData) {
  return productUpdateSchema.safeParse({
    nameBg: String(formData.get("nameBg") ?? ""),
    nameEn: String(formData.get("nameEn") ?? ""),
    descriptionBg: String(formData.get("descriptionBg") ?? ""),
    descriptionEn: String(formData.get("descriptionEn") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    price: String(formData.get("priceEur") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    sizeBg: String(formData.get("sizeBg") ?? ""),
    sizeEn: String(formData.get("sizeEn") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? "0"),
    isAvailable: formData.get("isAvailable") === "on",
    isPopular: formData.get("isPopular") === "on",
    isNew: formData.get("isNew") === "on",
    allergens: formData.getAll("allergens").map(String),
    allergensUnverified: formData.get("allergensUnverified") === "on",
  });
}

/**
 * A free `prod_*` id and slug for a new product, in the shape the imported
 * menu already uses (`prod_bekon_shunka` / `bekon-shunka`).
 *
 * The slug is a public URL, so it is Latin — never the Cyrillic name — and it
 * is made unique by suffixing, the same thing a human would do. The id is the
 * slug with underscores, which stays unique because a slug cannot contain one.
 */
async function nextProductIdentity(
  nameBg: string
): Promise<{ id: string; slug: string }> {
  const base = latinSlug(nameBg) || "produkt";

  for (let attempt = 1; attempt < 100; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const id = `prod_${slug.replace(/-/g, "_")}`;
    const clash = await db.menuProduct.findFirst({
      where: { OR: [{ id }, { slug }] },
      select: { id: true },
    });
    if (!clash) return { id, slug };
  }

  // A hundred products with the same name is not a naming problem any more.
  const unique = Date.now().toString(36);
  return { id: `prod_${base.replace(/-/g, "_")}_${unique}`, slug: `${base}-${unique}` };
}

/**
 * ADMIN+: create a product from the same form as the editor.
 *
 * It deliberately offers exactly the editor's fields — no variants. Sizes are
 * referenced by cart rows and order history, so adding them is still a
 * developer job (see docs/admin-menu-db-plan.md); a new product starts as a
 * single-price item and can be given variants later.
 */
export async function createProductAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Проверете полетата по-долу.",
      fieldErrors: firstFieldErrors(parsed.error),
    };
  }
  const data = parsed.data;

  const category = await db.menuCategory.findUnique({
    where: { id: data.categoryId },
    select: { id: true },
  });
  if (!category) return { ok: false, error: "Невалидна категория." };

  // A free-text price with no number in it leaves the basket nothing to
  // charge, so a NEW product needs at least one number somewhere in the text.
  if (data.price.priceEur === null) {
    return {
      ok: false,
      error: "Проверете полетата по-долу.",
      fieldErrors: { price: "Добавете поне едно число в цената (напр. 7.50)." },
    };
  }

  const { id, slug } = await nextProductIdentity(data.nameBg);

  try {
    await db.menuProduct.create({
      data: {
        id,
        slug,
        nameBg: data.nameBg,
        nameEn: data.nameEn,
        descriptionBg: data.descriptionBg,
        descriptionEn: data.descriptionEn,
        categoryId: data.categoryId,
        priceEur: data.price.priceEur,
        priceLabel: data.price.priceLabel,
        imageUrl: data.imageUrl || null,
        sizeBg: data.sizeBg || null,
        sizeEn: data.sizeEn || null,
        sortOrder: data.sortOrder,
        isAvailable: data.isAvailable,
        isPopular: data.isPopular,
        isNew: data.isNew,
        allergens: JSON.stringify(data.allergens),
        allergensUnverified: data.allergensUnverified,
      },
    });
  } catch (error) {
    console.error("[admin-menu] product create failed:", error);
    return { ok: false, error: "Продуктът не можа да бъде създаден. Опитайте отново." };
  }

  revalidateMenu();

  // Straight to the new product's own page: it is the one screen that proves
  // the product exists and is where an image or a correction goes next.
  // `redirect` throws, so it stays the last statement, outside any try/catch.
  redirect({ href: `/admin/products/${id}`, locale: await getLocale() });
}

/** ADMIN+: full product edit, including its variants' names and prices. */
export async function updateProductAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("productId") ?? "");
  const existing = await db.menuProduct.findUnique({
    where: { id },
    include: { variants: true },
  });
  if (!existing) return { ok: false, error: "Продуктът не беше намерен." };

  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Проверете полетата по-долу.",
      fieldErrors: firstFieldErrors(parsed.error),
    };
  }
  const data = parsed.data;

  const category = await db.menuCategory.findUnique({
    where: { id: data.categoryId },
    select: { id: true },
  });
  if (!category) return { ok: false, error: "Невалидна категория." };

  // Variants: the form posts variant-<id>-<field> for every EXISTING variant.
  // Adding/removing variants is out of the MVP (they are referenced by cart
  // rows and order history), so unknown ids are rejected rather than created.
  const variantUpdates: {
    id: string;
    nameBg: string;
    nameEn: string;
    priceEur: number;
  }[] = [];
  for (const variant of existing.variants) {
    const raw = {
      nameBg: formData.get(`variant-${variant.id}-nameBg`),
      nameEn: formData.get(`variant-${variant.id}-nameEn`),
      priceEur: formData.get(`variant-${variant.id}-priceEur`),
    };
    // A variant absent from the form entirely (e.g. an older tab) is skipped.
    if (raw.nameBg === null && raw.priceEur === null) continue;
    const vParsed = variantUpdateSchema.safeParse({
      nameBg: String(raw.nameBg ?? ""),
      nameEn: String(raw.nameEn ?? ""),
      priceEur: String(raw.priceEur ?? ""),
    });
    if (!vParsed.success) {
      return {
        ok: false,
        error: `Вариант „${variant.nameBg}“: ${vParsed.error.issues[0]?.message ?? "невалидни данни."}`,
      };
    }
    variantUpdates.push({ id: variant.id, ...vParsed.data });
  }

  await db.$transaction([
    db.menuProduct.update({
      where: { id },
      data: {
        nameBg: data.nameBg,
        nameEn: data.nameEn,
        descriptionBg: data.descriptionBg,
        descriptionEn: data.descriptionEn,
        categoryId: data.categoryId,
        // Text without any number keeps the previous number for the basket.
        priceEur: data.price.priceEur ?? existing.priceEur,
        priceLabel: data.price.priceLabel,
        imageUrl: data.imageUrl || null,
        sizeBg: data.sizeBg || null,
        sizeEn: data.sizeEn || null,
        sortOrder: data.sortOrder,
        isAvailable: data.isAvailable,
        isPopular: data.isPopular,
        isNew: data.isNew,
        allergens: JSON.stringify(data.allergens),
        allergensUnverified: data.allergensUnverified,
      },
    }),
    ...variantUpdates.map((v) =>
      db.menuVariant.update({
        where: { id: v.id },
        data: {
          nameBg: v.nameBg,
          nameEn: v.nameEn,
          priceEur: v.priceEur,
        },
      })
    ),
  ]);

  // Best-effort cleanup: if the image actually changed and the OLD one was one
  // of our uploads (not a manually-typed /images/... path), delete it from
  // disk — but only once confirmed no other product still uses that exact
  // path. Never blocks or fails the save that already committed above.
  if (existing.imageUrl && existing.imageUrl !== data.imageUrl) {
    await deleteProductImageIfUnused(existing.imageUrl, id).catch(() => {});
  }

  revalidateMenu();
  revalidatePath(`/admin/products/${id}`);

  // Success → back to the product list. `redirect` throws (NEXT_REDIRECT), so
  // it must stay outside any try/catch — and it is deliberately the last
  // statement: every failure path above returns an ActionResult instead, which
  // keeps the admin on the form with the error shown.
  redirect({ href: "/admin/products", locale: await getLocale() });
}

/**
 * ADMIN+: category edit (slug stays fixed — it is a public URL), including an
 * optional new photo in the `image` field. All-or-nothing: if the photo is
 * invalid or cannot be stored, NOTHING is written and the old photo stays.
 * The photo is validated by its bytes, re-encoded (EXIF orientation applied,
 * metadata stripped) and stored on the Persistent Disk before the DB write;
 * the previous file is removed only after the DB points at the new one.
 * The legacy emoji (`icon`) is no longer edited here — it stays untouched as
 * the public fallback for categories without a photo.
 */
export async function updateCategoryAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("categoryId") ?? "");
  const existing = await db.menuCategory.findUnique({
    where: { id },
    select: { id: true, imageUrl: true },
  });
  if (!existing) return { ok: false, error: "Категорията не беше намерена." };

  const parsed = categoryUpdateSchema.safeParse({
    nameBg: String(formData.get("nameBg") ?? ""),
    nameEn: String(formData.get("nameEn") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? "0"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Проверете полетата.",
      fieldErrors: firstFieldErrors(parsed.error),
    };
  }

  // ── Optional new photo ────────────────────────────────────────────────
  let newImageUrl: string | null = null;
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const check = validateCategoryImageUpload({
      size: image.size,
      mimeType: image.type,
      bytes,
    });
    if (!check.ok) {
      return { ok: false, error: check.message, fieldErrors: { image: check.message } };
    }
    if (!isPersistentUploadsConfigured()) {
      console.error("[admin] category photo refused: UPLOADS_DIR is not set in production");
      return {
        ok: false,
        error:
          "Снимката не може да се запази: хранилището за снимки не е настроено. Свържете се с поддръжката.",
      };
    }
    try {
      const webp = await normalizeCategoryImage(bytes);
      newImageUrl = await saveCategoryImage(webp);
    } catch (error) {
      const isImageError = error instanceof ImageProcessingError;
      if (!isImageError) console.error("[admin] category photo save failed", error);
      const message = isImageError
        ? error.message
        : "Снимката не беше запазена. Опитайте отново.";
      return { ok: false, error: message, fieldErrors: { image: message } };
    }
  }

  try {
    await db.menuCategory.update({
      where: { id },
      data: {
        nameBg: parsed.data.nameBg,
        nameEn: parsed.data.nameEn,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
        ...(newImageUrl ? { imageUrl: newImageUrl } : {}),
      },
    });
  } catch (error) {
    console.error("[admin] category update failed", error);
    if (newImageUrl) await discardCategoryImage(newImageUrl);
    return { ok: false, error: "Промените не бяха запазени. Опитайте отново." };
  }

  if (newImageUrl && existing.imageUrl && existing.imageUrl !== newImageUrl) {
    await deleteCategoryImageIfUnused(existing.imageUrl, id);
  }

  revalidateMenu();
  return {
    ok: true,
    message: newImageUrl ? "Категорията и снимката са запазени." : "Категорията е запазена.",
  };
}
