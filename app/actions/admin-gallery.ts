"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { GALLERY_CACHE_TAG } from "@/lib/gallery-data";
import {
  deleteGalleryImageIfUnused,
  discardGalleryImage,
  saveGalleryImage,
} from "@/lib/uploads/gallery-image-storage";
import { ImageProcessingError, normalizeGalleryImage } from "@/lib/uploads/image-processing";
import { isPersistentUploadsConfigured } from "@/lib/uploads/paths";
import { validateCategoryImageUpload } from "@/lib/uploads/validate";
import type { ActionResult } from "@/types/auth";

/**
 * Admin → Галерия (ADMIN+): the photos in "Из нашата кухня" on the home page
 * and on /gallery. Photos go through the same pipeline as category photos —
 * validated by their bytes, re-encoded to WebP (EXIF orientation applied,
 * metadata dropped) and stored on the Persistent Disk before the DB write;
 * a replaced file is removed only after the DB no longer points at it.
 */

const captionsSchema = z.object({
  captionBg: z.string().trim().max(60, "Най-много 60 знака."),
  captionEn: z.string().trim().max(60, "Най-много 60 знака."),
});

function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function revalidateGallery(): void {
  updateTag(GALLERY_CACHE_TAG);
  revalidatePath("/admin/gallery");
}

function parseCaptions(formData: FormData) {
  return captionsSchema.safeParse({
    captionBg: String(formData.get("captionBg") ?? ""),
    captionEn: String(formData.get("captionEn") ?? ""),
  });
}

type StoredPhoto = { ok: true; url: string } | { ok: false; result: ActionResult };

/** Validates, re-encodes and stores the `image` file. Null when none was sent. */
async function storePhoto(formData: FormData): Promise<StoredPhoto | null> {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return null;

  const bytes = new Uint8Array(await image.arrayBuffer());
  const check = validateCategoryImageUpload({ size: image.size, mimeType: image.type, bytes });
  if (!check.ok) {
    return {
      ok: false,
      result: { ok: false, error: check.message, fieldErrors: { image: check.message } },
    };
  }
  if (!isPersistentUploadsConfigured()) {
    console.error("[admin] gallery photo refused: UPLOADS_DIR is not set in production");
    return {
      ok: false,
      result: {
        ok: false,
        error:
          "Снимката не може да се запази: хранилището за снимки не е настроено. Свържете се с поддръжката.",
      },
    };
  }
  try {
    return { ok: true, url: await saveGalleryImage(await normalizeGalleryImage(bytes)) };
  } catch (error) {
    const isImageError = error instanceof ImageProcessingError;
    if (!isImageError) console.error("[admin] gallery photo save failed", error);
    const message = isImageError ? error.message : "Снимката не беше запазена. Опитайте отново.";
    return { ok: false, result: { ok: false, error: message, fieldErrors: { image: message } } };
  }
}

/** Adds a new photo IN FRONT, so it shows on the home page straight away. */
export async function createGalleryImageAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const parsed = parseCaptions(formData);
  if (!parsed.success) {
    return { ok: false, error: "Проверете полетата.", fieldErrors: firstFieldErrors(parsed.error) };
  }

  const photo = await storePhoto(formData);
  if (!photo) {
    const message = "Изберете снимка.";
    return { ok: false, error: message, fieldErrors: { image: message } };
  }
  if (!photo.ok) return photo.result;

  try {
    const first = await db.galleryImage.findFirst({
      orderBy: { sortOrder: "asc" },
      select: { sortOrder: true },
    });
    await db.galleryImage.create({
      data: {
        imageUrl: photo.url,
        captionBg: parsed.data.captionBg,
        captionEn: parsed.data.captionEn,
        sortOrder: (first?.sortOrder ?? 10) - 10,
      },
    });
  } catch (error) {
    console.error("[admin] gallery create failed", error);
    await discardGalleryImage(photo.url);
    return { ok: false, error: "Снимката не беше добавена. Опитайте отново." };
  }

  revalidateGallery();
  return { ok: true, message: "Снимката е добавена най-отпред в галерията." };
}

/** Changes the captions and, optionally, replaces the photo of one tile. */
export async function updateGalleryImageAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("id") ?? "");
  const existing = await db.galleryImage.findUnique({
    where: { id },
    select: { id: true, imageUrl: true },
  });
  if (!existing) return { ok: false, error: "Снимката не беше намерена — презаредете страницата." };

  const parsed = parseCaptions(formData);
  if (!parsed.success) {
    return { ok: false, error: "Проверете полетата.", fieldErrors: firstFieldErrors(parsed.error) };
  }

  const photo = await storePhoto(formData);
  if (photo && !photo.ok) return photo.result;
  const newUrl = photo?.url ?? null;

  try {
    await db.galleryImage.update({
      where: { id },
      data: {
        captionBg: parsed.data.captionBg,
        captionEn: parsed.data.captionEn,
        ...(newUrl ? { imageUrl: newUrl } : {}),
      },
    });
  } catch (error) {
    console.error("[admin] gallery update failed", error);
    if (newUrl) await discardGalleryImage(newUrl);
    return { ok: false, error: "Промените не бяха запазени. Опитайте отново." };
  }

  if (newUrl && existing.imageUrl !== newUrl) {
    await deleteGalleryImageIfUnused(existing.imageUrl);
  }

  revalidateGallery();
  return { ok: true, message: newUrl ? "Снимката е сменена." : "Надписът е запазен." };
}

/** Removes one tile from the gallery (and its file, if nothing else uses it). */
export async function deleteGalleryImageAction(id: string): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const existing = await db.galleryImage.findUnique({
    where: { id },
    select: { imageUrl: true },
  });
  if (!existing) return { ok: true, message: "Снимката вече е премахната." };

  try {
    await db.galleryImage.delete({ where: { id } });
  } catch (error) {
    console.error("[admin] gallery delete failed", error);
    return { ok: false, error: "Снимката не беше премахната. Опитайте отново." };
  }

  await deleteGalleryImageIfUnused(existing.imageUrl);
  revalidateGallery();
  return { ok: true, message: "Снимката е премахната." };
}

/**
 * Moves one tile a place earlier or later. The whole list is renumbered
 * 10, 20, 30… in one transaction, so equal or gapped sortOrder values left
 * by earlier edits can never make a move do nothing.
 */
export async function moveGalleryImageAction(
  id: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const rows = await db.galleryImage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const from = rows.findIndex((row) => row.id === id);
  if (from === -1) return { ok: false, error: "Снимката не беше намерена — презаредете страницата." };
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length) return { ok: true };

  const ordered = rows.map((row) => row.id);
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];

  try {
    await db.$transaction(
      ordered.map((rowId, index) =>
        db.galleryImage.update({ where: { id: rowId }, data: { sortOrder: (index + 1) * 10 } })
      )
    );
  } catch (error) {
    console.error("[admin] gallery reorder failed", error);
    return { ok: false, error: "Подредбата не беше запазена. Опитайте отново." };
  }

  revalidateGallery();
  return { ok: true };
}
