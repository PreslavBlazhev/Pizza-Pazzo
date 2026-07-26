"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { MENU_CACHE_TAG } from "@/lib/menu-data";
import { deleteProductImageIfUnused } from "@/lib/uploads/product-image-storage";
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
  revalidateTag(MENU_CACHE_TAG);
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

  const parsed = productUpdateSchema.safeParse({
    nameBg: String(formData.get("nameBg") ?? ""),
    nameEn: String(formData.get("nameEn") ?? ""),
    descriptionBg: String(formData.get("descriptionBg") ?? ""),
    descriptionEn: String(formData.get("descriptionEn") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    priceBgn: String(formData.get("priceBgn") ?? ""),
    priceEur: String(formData.get("priceEur") ?? ""),
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
    priceBgn: number;
    priceEur: number;
  }[] = [];
  for (const variant of existing.variants) {
    const raw = {
      nameBg: formData.get(`variant-${variant.id}-nameBg`),
      nameEn: formData.get(`variant-${variant.id}-nameEn`),
      priceBgn: formData.get(`variant-${variant.id}-priceBgn`),
      priceEur: formData.get(`variant-${variant.id}-priceEur`),
    };
    // A variant absent from the form entirely (e.g. an older tab) is skipped.
    if (raw.nameBg === null && raw.priceBgn === null) continue;
    const vParsed = variantUpdateSchema.safeParse({
      nameBg: String(raw.nameBg ?? ""),
      nameEn: String(raw.nameEn ?? ""),
      priceBgn: String(raw.priceBgn ?? ""),
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
        priceBgn: data.priceBgn,
        priceEur: data.priceEur,
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
          priceBgn: v.priceBgn,
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

/** ADMIN+: category edit (slug stays fixed — it is a public URL). */
export async function updateCategoryAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("categoryId") ?? "");
  const existing = await db.menuCategory.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Категорията не беше намерена." };

  const parsed = categoryUpdateSchema.safeParse({
    nameBg: String(formData.get("nameBg") ?? ""),
    nameEn: String(formData.get("nameEn") ?? ""),
    icon: String(formData.get("icon") ?? ""),
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

  await db.menuCategory.update({
    where: { id },
    data: {
      nameBg: parsed.data.nameBg,
      nameEn: parsed.data.nameEn,
      icon: parsed.data.icon || null,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
    },
  });

  revalidateMenu();
  return { ok: true, message: "Категорията е запазена." };
}
