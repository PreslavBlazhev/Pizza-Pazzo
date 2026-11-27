/**
 * Gallery photos (Admin → Галерия): the migration keeps the former
 * placeholder tiles, photos are stored like category photos (WebP, upright,
 * no EXIF) but up to 1600 px, and a replaced/deleted photo's file is removed
 * only when no tile uses it — bundled placeholders are never touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { db } from "@/lib/db";
import * as storage from "@/lib/uploads/gallery-image-storage";
import { isSafeGeneratedFilename } from "@/lib/uploads/filename";
import { normalizeGalleryImage } from "@/lib/uploads/image-processing";
import { extractGalleryImageFilename } from "@/lib/uploads/paths";

const uploadsDir = mkdtempSync(path.join(tmpdir(), "pp-gallery-uploads-"));
process.env.UPLOADS_DIR = uploadsDir;

test("the migration seeds the seven former placeholder tiles, in order", async () => {
  const rows = await db.galleryImage.findMany({ orderBy: { sortOrder: "asc" } });
  assert.equal(rows.length, 7);
  assert.equal(rows[0].captionBg, "Пица");
  assert.equal(rows[0].captionEn, "Pizza");
  assert.ok(rows.every((r) => r.imageUrl.startsWith("/images/products/placeholder-")));
  const orders = rows.map((r) => r.sortOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test("gallery photos are scaled to 1600 px, never enlarged", async () => {
  const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#c33" } })
    .jpeg()
    .toBuffer();
  const meta = await sharp(await normalizeGalleryImage(new Uint8Array(big))).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 1600);
  assert.equal(meta.height, 1200);

  const small = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#393" } })
    .png()
    .toBuffer();
  assert.equal((await sharp(await normalizeGalleryImage(new Uint8Array(small))).metadata()).width, 30);
});

test("a replaced photo is deleted; a used one and placeholders are kept", async () => {
  const photo = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#393" } })
    .jpeg()
    .toBuffer();
  const pathA = await storage.saveGalleryImage(await normalizeGalleryImage(new Uint8Array(photo)));
  const pathB = await storage.saveGalleryImage(await normalizeGalleryImage(new Uint8Array(photo)));
  assert.match(pathA, /^\/uploads\/gallery\/[a-f0-9-]+\.webp$/);
  const fileA = extractGalleryImageFilename(pathA)!;
  const fileB = extractGalleryImageFilename(pathB)!;
  assert.equal(isSafeGeneratedFilename(fileA), true);
  assert.equal(existsSync(path.join(uploadsDir, "gallery", fileA)), true);

  const tile = await db.galleryImage.create({
    data: { imageUrl: pathB, captionBg: "Тест", sortOrder: 0 },
  });

  await storage.deleteGalleryImageIfUnused(pathB); // still on a tile → kept
  assert.ok(await storage.readGalleryImage(fileB));
  await storage.deleteGalleryImageIfUnused(pathA); // unused → removed
  assert.equal(await storage.readGalleryImage(fileA), null);

  await db.galleryImage.delete({ where: { id: tile.id } });
  await storage.deleteGalleryImageIfUnused(pathB);
  assert.equal(await storage.readGalleryImage(fileB), null);

  // Never touches anything that isn't one of our uploads.
  await storage.deleteGalleryImageIfUnused("/images/products/placeholder-pizza.svg");
  await storage.deleteGalleryImageIfUnused("/uploads/gallery/../../dev.db");
  assert.equal(extractGalleryImageFilename("/uploads/gallery/../x.webp"), null);
});
