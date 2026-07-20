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
