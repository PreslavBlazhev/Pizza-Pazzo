"use client";

import { useEffect, useRef, useState } from "react";

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Mirrors MAX_CATEGORY_UPLOAD_BYTES (lib/uploads/validate.ts — server-only). */
const MAX_BYTES = 8 * 1024 * 1024;
/** A photo over MAX_BYTES is re-encoded in the browser to fit this side. */
const SHRINK_MAX_SIDE = 2400;

const UNSUPPORTED_MESSAGE = "Неподдържан формат. Изберете снимка във формат JPG, PNG или WebP.";
const HEIC_MESSAGE =
  "Снимката е във формат HEIC, който не се поддържа. Изберете я като JPG или изберете друга снимка.";
const TOO_LARGE_MESSAGE = `Снимката е твърде голяма (макс. ${MAX_BYTES / 1024 / 1024} MB).`;

/**
 * Big phone photos (over the 8 MB request budget) are re-encoded to JPEG in
 * the browser so the owner never has to resize anything by hand.
 * createImageBitmap applies the EXIF orientation, so the result is upright.
 * Returns null when the browser can't decode it — the caller then reports
 * "too large" instead of sending a request that would be refused anyway.
 */
async function shrinkForUpload(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, SHRINK_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; // PNG transparency → white, not black, in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88)
    );
    if (!blob || blob.size > MAX_BYTES) return null;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}

/** True when this admin page now redirects (the session is gone). */
export async function sessionExpired(): Promise<boolean> {
  try {
    const res = await fetch(window.location.pathname, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
    });
    return res.type === "opaqueredirect";
  } catch {
    return false; // offline — a real connection problem
  }
}

/**
 * State for one "pick a photo from the phone or computer" control: a hidden
 * file input (no `capture`, so the camera is never forced), an immediate
 * preview, client-side format checks with clear messages and automatic
 * shrinking of photos that are too big to send. The server re-checks all of
 * it by the bytes (lib/uploads/validate.ts).
 */
export function usePhotoPicker(onPick?: () => void) {
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the blob preview when it is replaced or the component unmounts.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function clearPicked() {
    setPickedFile(null);
    setPreviewUrl(null);
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // lets the same file be picked again after an error
    if (!file) return;

    onPick?.();
    setPhotoError(null);

    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    if (type === "image/heic" || type === "image/heif" || /\.(heic|heif)$/.test(name)) {
      setPhotoError(HEIC_MESSAGE);
      return;
    }
    // Some Android pickers send no type at all — the server sniffs the bytes.
    if (type && !ACCEPTED_PHOTO_TYPES.includes(type)) {
      setPhotoError(UNSUPPORTED_MESSAGE);
      return;
    }

    let upload = file;
    if (file.size > MAX_BYTES) {
      setIsPreparing(true);
      const shrunk = await shrinkForUpload(file);
      setIsPreparing(false);
      if (!shrunk) {
        setPhotoError(TOO_LARGE_MESSAGE);
        return;
      }
      upload = shrunk;
    }

    setPickedFile(upload);
    setPreviewUrl(URL.createObjectURL(upload));
  }

  return {
    pickedFile,
    previewUrl,
    photoError,
    setPhotoError,
    isPreparing,
    fileInputRef,
    handleFileChange,
    clearPicked,
    openPicker,
  };
}
