import sharp from "sharp";

/** Longest side of a stored category photo. The largest place it is shown is
 *  the home page tile (~300 CSS px, ×2–3 on phones), so 1200 px is plenty. */
const CATEGORY_IMAGE_MAX_SIDE = 1200;

/** Refuse decompression bombs before decoding (≈ 100 MP; phones top out ~50 MP
 *  for normal photos, 200 MP modes produce files over the byte limit anyway). */
const MAX_INPUT_PIXELS = 100_000_000;

export class ImageProcessingError extends Error {}

/**
 * Re-encodes an already signature-checked upload into a clean WebP:
 *  - `.rotate()` with no angle applies the EXIF orientation, so a portrait
 *    phone photo is stored upright (browsers then see no EXIF to re-apply);
 *  - resized to fit CATEGORY_IMAGE_MAX_SIDE, never enlarged;
 *  - all metadata (EXIF incl. GPS location, ICC aside) is dropped because
 *    sharp does not copy it unless asked to;
 *  - anything that is not really a decodable image throws here, a second
 *    gate after the magic-byte sniff.
 */
export async function normalizeCategoryImage(bytes: Uint8Array): Promise<Uint8Array> {
  return normalizeToWebp(bytes, CATEGORY_IMAGE_MAX_SIDE);
}

/** Gallery photos: the big home-page tile is ~600 CSS px wide on desktop
 *  (×2 on retina), so they keep a little more detail than category photos. */
const GALLERY_IMAGE_MAX_SIDE = 1600;

/** Same pipeline as normalizeCategoryImage, sized for the gallery. */
export async function normalizeGalleryImage(bytes: Uint8Array): Promise<Uint8Array> {
  return normalizeToWebp(bytes, GALLERY_IMAGE_MAX_SIDE);
}

async function normalizeToWebp(bytes: Uint8Array, maxSide: number): Promise<Uint8Array> {
  try {
    const out = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: maxSide,
        height: maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    throw new ImageProcessingError("Снимката не може да бъде обработена. Опитайте с друга снимка.");
  }
}
