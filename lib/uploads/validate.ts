/**
 * Product image upload validation — server-side only.
 *
 * Never trusts the browser-supplied `File.type` or filename alone: both are
 * attacker-controlled. The real gate is the magic-byte signature check in
 * `sniffImageFormat`, which is what decides the file extension we actually
 * write to disk — not the client's claim.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export type ImageFormat = "jpeg" | "png" | "webp";

const ALLOWED_MIME_TYPES: Record<string, ImageFormat> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export interface ValidationSuccess {
  ok: true;
  format: ImageFormat;
  extension: string;
}

export interface ValidationFailure {
  ok: false;
  /** Bulgarian message, safe to show the admin directly. */
  message: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Reads the first bytes of the buffer and identifies the real image format —
 * deliberately ignores the claimed MIME type and file extension. Returns null
 * for anything else, including SVG (which is XML/script-capable and must
 * never be accepted — see the explicit ban in the brief).
 */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "webp";
  }
  return null;
}

/**
 * Full validation pipeline for a product image upload: size → declared MIME
 * type/extension (fast, cheap rejection) → actual byte signature (the real
 * gate). All three must agree on a supported format.
 */
export function validateProductImageUpload(params: {
  size: number;
  mimeType: string;
  filename: string;
  bytes: Uint8Array;
}): ValidationResult {
  const { size, mimeType, filename, bytes } = params;

  if (size <= 0) {
    return { ok: false, message: "Файлът е празен." };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `Файлът е твърде голям (макс. ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
    };
  }

  const declaredFormat = ALLOWED_MIME_TYPES[mimeType.toLowerCase()];
  if (!declaredFormat) {
    return {
      ok: false,
      message: "Неподдържан формат. Разрешени са JPG, PNG и WebP.",
    };
  }

  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const extensionMatchesFormat: Record<ImageFormat, string[]> = {
    jpeg: ["jpg", "jpeg"],
    png: ["png"],
    webp: ["webp"],
  };
  if (!extensionMatchesFormat[declaredFormat].includes(ext)) {
    return { ok: false, message: "Разширението на файла не съответства на съдържанието му." };
  }

  const actualFormat = sniffImageFormat(bytes);
  if (!actualFormat) {
    return {
      ok: false,
      message: "Файлът не е валидно изображение (JPG, PNG или WebP).",
    };
  }
  if (actualFormat !== declaredFormat) {
    return {
      ok: false,
      message: "Съдържанието на файла не съответства на обявения формат.",
    };
  }

  return { ok: true, format: actualFormat, extension: EXTENSION_BY_FORMAT[actualFormat] };
}

// ── Category photos ─────────────────────────────────────────────────────────
// Uploaded straight from the owner's phone gallery, so this is more lenient
// about the CLAIMS (some Android pickers send an empty MIME type or a name
// without an extension) and just as strict about the BYTES: the sniffed
// signature is the only thing that decides whether the file is accepted.
// The bytes are then re-encoded by lib/uploads/image-processing.ts, so the
// stored file is always a fresh WebP made by us, never the original upload.

/** 8 MB stays under Next's 10 MB proxy body buffer with room for the other
 *  form fields (see serverActions.bodySizeLimit in next.config.ts). Larger
 *  phone photos are shrunk in the browser before they are sent. */
export const MAX_CATEGORY_UPLOAD_BYTES = 8 * 1024 * 1024;

/** HEIC/HEIF (iPhone/Samsung "high efficiency") — recognised only to give a
 *  clear message; it is not decodable by our image pipeline. */
export function isHeifSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (box !== "ftyp") return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
}

export const UNSUPPORTED_IMAGE_MESSAGE =
  "Неподдържан формат. Изберете снимка във формат JPG, PNG или WebP.";
export const HEIC_IMAGE_MESSAGE =
  "Снимката е във формат HEIC, който не се поддържа. Изберете я като JPG (на iPhone: Настройки → Камера → Формати → „Най-съвместим“) или изберете друга снимка.";

export function validateCategoryImageUpload(params: {
  size: number;
  mimeType: string;
  bytes: Uint8Array;
}): ValidationResult {
  const { size, mimeType, bytes } = params;

  if (size <= 0 || bytes.length === 0) {
    return { ok: false, message: "Избраният файл е празен." };
  }
  if (size > MAX_CATEGORY_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `Снимката е твърде голяма (макс. ${MAX_CATEGORY_UPLOAD_BYTES / 1024 / 1024} MB).`,
    };
  }
  if (isHeifSignature(bytes)) {
    return { ok: false, message: HEIC_IMAGE_MESSAGE };
  }

  const declared = mimeType.trim().toLowerCase();
  if (declared && !ALLOWED_MIME_TYPES[declared]) {
    return { ok: false, message: UNSUPPORTED_IMAGE_MESSAGE };
  }

  const actualFormat = sniffImageFormat(bytes);
  if (!actualFormat) {
    return { ok: false, message: "Файлът не е валидна снимка (JPG, PNG или WebP)." };
  }
  if (declared && ALLOWED_MIME_TYPES[declared] !== actualFormat) {
    return { ok: false, message: "Съдържанието на файла не съответства на типа му." };
  }

  return { ok: true, format: actualFormat, extension: EXTENSION_BY_FORMAT[actualFormat] };
}
