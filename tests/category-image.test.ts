/**
 * Category photos (Admin → Категории): server-side validation by bytes,
 * re-encoding that applies the phone's EXIF orientation and drops metadata,
 * storage on the uploads disk, and cleanup of the replaced file.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { db } from "@/lib/db";
import * as storage from "@/lib/uploads/category-image-storage";
import { isSafeGeneratedFilename } from "@/lib/uploads/filename";
import { ImageProcessingError, normalizeCategoryImage } from "@/lib/uploads/image-processing";
import { extractCategoryImageFilename, isPersistentUploadsConfigured } from "@/lib/uploads/paths";
import {
  HEIC_IMAGE_MESSAGE,
  MAX_CATEGORY_UPLOAD_BYTES,
  validateCategoryImageUpload,
} from "@/lib/uploads/validate";

// Read at call time by lib/uploads/paths.ts — never the real uploads folder.
const uploadsDir = mkdtempSync(path.join(tmpdir(), "pp-category-uploads-"));
process.env.UPLOADS_DIR = uploadsDir;

let jpeg: Uint8Array;
let png: Uint8Array;
let webp: Uint8Array;
/** A 40×20 landscape JPEG tagged "rotate 90° CW" — how phones save portraits. */
let rotatedJpeg: Uint8Array;

before(async () => {
  const base = sharp({ create: { width: 40, height: 20, channels: 3, background: "#c33" } });
  jpeg = new Uint8Array(await base.clone().jpeg().toBuffer());
  png = new Uint8Array(await base.clone().png().toBuffer());
  webp = new Uint8Array(await base.clone().webp().toBuffer());
  rotatedJpeg = new Uint8Array(
    await base
      .clone()
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: "TestPhone" } } })
      .toBuffer()
  );
});

const ok = (bytes: Uint8Array, mimeType: string) =>
  validateCategoryImageUpload({ size: bytes.length, mimeType, bytes });

test("JPG, PNG and WebP are accepted by their bytes", () => {
  assert.equal(ok(jpeg, "image/jpeg").ok, true);
  assert.equal(ok(png, "image/png").ok, true);
  assert.equal(ok(webp, "image/webp").ok, true);
  // Some Android pickers send no MIME type — the bytes decide.
  assert.equal(ok(jpeg, "").ok, true);
});

test("non-images, SVG, GIF and lying MIME types are refused with a clear message", () => {
  const text = new TextEncoder().encode("hello, not a picture at all");
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const gif = new TextEncoder().encode("GIF89a........");
  for (const [bytes, mime] of [
    [text, "image/jpeg"],
    [svg, "image/svg+xml"],
    [gif, "image/gif"],
    [text, "text/plain"],
    [text, ""],
  ] as const) {
    const r = ok(bytes, mime);
    assert.equal(r.ok, false, `${mime} must be refused`);
    if (!r.ok) assert.match(r.message, /JPG|формат|съответства/);
  }
  const mismatch = ok(png, "image/jpeg");
  assert.equal(mismatch.ok, false);
});

test("HEIC from a phone gets its own explanation", () => {
  const heic = new Uint8Array(32);
  heic.set(new TextEncoder().encode("ftypheic"), 4);
  const r = ok(heic, "image/heic");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.message, HEIC_IMAGE_MESSAGE);
});

test("empty and oversized files are refused", () => {
  assert.equal(validateCategoryImageUpload({ size: 0, mimeType: "image/jpeg", bytes: new Uint8Array() }).ok, false);
  const r = validateCategoryImageUpload({
    size: MAX_CATEGORY_UPLOAD_BYTES + 1,
    mimeType: "image/jpeg",
    bytes: jpeg,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /твърде голяма/);
});

test("a portrait phone photo is stored upright, as WebP, without EXIF", async () => {
  const before = await sharp(rotatedJpeg).metadata();
  assert.equal(before.orientation, 6);
  assert.equal(before.width, 40);

  const out = await normalizeCategoryImage(rotatedJpeg);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 20, "rotated: width and height swap");
  assert.equal(meta.height, 40);
  assert.equal(meta.orientation, undefined, "no orientation tag left to re-apply");
  assert.equal(meta.exif, undefined, "EXIF (camera, GPS) is dropped");
});

test("large photos are scaled down to 1200 px, small ones are never enlarged", async () => {
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#393" } })
    .jpeg()
    .toBuffer();
  const meta = await sharp(await normalizeCategoryImage(new Uint8Array(big))).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 800);

  const small = await sharp(await normalizeCategoryImage(jpeg)).metadata();
  assert.equal(small.width, 40);
});

test("a file with a valid signature but broken body is refused, not stored", async () => {
  const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
  await assert.rejects(normalizeCategoryImage(broken), ImageProcessingError);
});

test("saved photos live under UPLOADS_DIR, are readable, and the replaced one is removed", async () => {
  const pathA = await storage.saveCategoryImage(await normalizeCategoryImage(jpeg));
  const pathB = await storage.saveCategoryImage(await normalizeCategoryImage(png));
  assert.match(pathA, /^\/uploads\/categories\/[a-f0-9-]+\.webp$/);
  const fileA = extractCategoryImageFilename(pathA)!;
  assert.equal(isSafeGeneratedFilename(fileA), true);
  assert.equal(existsSync(path.join(uploadsDir, "categories", fileA)), true);
  assert.ok(await storage.readCategoryImage(fileA));

  await db.menuCategory.create({
    data: { id: "cat_test_photo", slug: "test-photo", nameBg: "Тест", nameEn: "Test", imageUrl: pathB },
  });

  // A still-referenced photo is kept; an unreferenced one is deleted.
  await storage.deleteCategoryImageIfUnused(pathB, "cat_other");
  assert.ok(await storage.readCategoryImage(extractCategoryImageFilename(pathB)!));
  await storage.deleteCategoryImageIfUnused(pathA, "cat_test_photo");
  assert.equal(await storage.readCategoryImage(fileA), null);

  // Paths that aren't our uploads are never touched.
  await storage.deleteCategoryImageIfUnused("/images/categories/pizza.jpg", "x");
  await storage.deleteCategoryImageIfUnused("/uploads/categories/../../dev.db", "x");
});

test("production refuses to store photos when UPLOADS_DIR is missing", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, dir: env.UPLOADS_DIR };
  try {
    env.NODE_ENV = "production";
    env.UPLOADS_DIR = "";
    assert.equal(isPersistentUploadsConfigured(), false);
    env.UPLOADS_DIR = "/var/data/uploads";
    assert.equal(isPersistentUploadsConfigured(), true);
  } finally {
    env.NODE_ENV = saved.node;
    env.UPLOADS_DIR = saved.dir;
  }
});
