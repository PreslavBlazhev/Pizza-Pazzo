"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Product image field for the admin editor: upload-from-device with preview,
 * OR type a path/URL by hand (kept — some products still use static
 * `/images/products/...` files). Whichever produced the current `value` is
 * what gets submitted as the form's `imageUrl` field on Save; the upload
 * itself happens immediately on file selection, via a separate request to
 * `/api/admin/upload-product-image` — Save only persists the resulting path.
 */
export function ProductImageUploadField({
  defaultValue,
  error,
  onUploadingChange,
}: {
  defaultValue: string;
  error?: string;
  /** Lets the parent form disable "Save" while an upload is in flight, so a
   *  submit mid-upload can never persist a blob URL or a blanked-out field. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Local blob preview is only alive between "file picked" and "upload
  // finished"; once the server confirms, `value` (the real /uploads path)
  // takes over and the blob is no longer needed.
  const previewSrc = value || null;

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  useEffect(() => {
    onUploadingChange?.(status === "uploading");
  }, [status, onUploadingChange]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setStatus("error");
      setMessage("Неподдържан формат. Разрешени са JPG, PNG и WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("error");
      setMessage(`Файлът е твърде голям (макс. ${Math.floor(MAX_BYTES / 1024 / 1024)} MB).`);
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const localPreview = URL.createObjectURL(file);
    objectUrlRef.current = localPreview;
    setValue(localPreview);
    setStatus("uploading");
    setMessage("Качване…");

    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await fetch("/api/admin/upload-product-image", { method: "POST", body: fd });
      const data: { ok?: boolean; path?: string; error?: string } = await res.json();

      if (!res.ok || !data.ok || !data.path) {
        setStatus("error");
        setMessage(data.error ?? "Качването е неуспешно.");
        setValue(defaultValue); // fall back to the last known-good value
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setValue(data.path);
      setStatus("success");
      setMessage("Снимката е качена успешно.");
    } catch {
      setStatus("error");
      setMessage("Качването е неуспешно. Проверете връзката.");
      setValue(defaultValue);
    }
  }

  function handleRemove() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setValue("");
    setStatus("idle");
    setMessage(null);
  }

  function handleRevert() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setValue(defaultValue);
    setStatus("idle");
    setMessage(null);
  }

  const isDirty = value !== defaultValue;
  const isUploading = status === "uploading";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-pizza-cream-dark bg-pizza-cream/20 p-4 sm:col-span-2 lg:col-span-3">
      <span className="text-sm font-medium text-pizza-ink">Продуктова снимка</span>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Preview */}
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-pizza-cream-dark bg-white">
          {previewSrc ? (
            <Image
              src={previewSrc}
              alt="Преглед на продуктовата снимка"
              fill
              sizes="128px"
              unoptimized
              className={cn("object-cover", isUploading && "opacity-60")}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl">🍕</div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={handleFileChange}
              className="hidden"
              aria-label="Избери файл със снимка"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full bg-pizza-green px-5 py-2 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
            >
              {isUploading ? "Качване…" : previewSrc ? "Смени снимката" : "Избери снимка"}
            </button>
            {isDirty && (
              <button
                type="button"
                disabled={isUploading}
                onClick={handleRevert}
                className="rounded-full border border-pizza-cream-dark bg-white px-5 py-2 text-sm font-semibold text-pizza-ink transition hover:border-pizza-green/50 disabled:opacity-60"
              >
                Отмени промяната
              </button>
            )}
            {previewSrc && (
              <button
                type="button"
                disabled={isUploading}
                onClick={handleRemove}
                className="rounded-full border border-brand/40 bg-white px-5 py-2 text-sm font-semibold text-brand transition hover:bg-pizza-red-light disabled:opacity-60"
              >
                Премахни снимката
              </button>
            )}
          </div>
          <p className="text-xs text-pizza-muted">
            JPG, PNG или WebP, до {Math.floor(MAX_BYTES / 1024 / 1024)} MB.
          </p>
          {status === "success" && <FormAlert tone="success">{message}</FormAlert>}
          {status === "error" && <FormAlert tone="error">{message}</FormAlert>}
        </div>
      </div>

      {/* Manual path/URL fallback — kept for static /images/products/... files. */}
      <Input
        label="Или въведете път/URL ръчно"
        name="imageUrl"
        value={value.startsWith("blob:") ? "" : value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("idle");
        }}
        placeholder="Напр. /images/products/margarita.jpg"
        error={error}
        className="font-mono"
      />
    </div>
  );
}
