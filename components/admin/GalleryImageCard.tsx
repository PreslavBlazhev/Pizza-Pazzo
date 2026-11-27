"use client";

import { useState, useTransition } from "react";
import {
  createGalleryImageAction,
  deleteGalleryImageAction,
  moveGalleryImageAction,
  updateGalleryImageAction,
} from "@/app/actions/admin-gallery";
import { ACCEPTED_PHOTO_TYPES, sessionExpired, usePhotoPicker } from "@/components/admin/usePhotoPicker";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import type { ActionResult } from "@/types/auth";
import { cn } from "@/lib/utils";

export interface AdminGalleryImage {
  id: string;
  imageUrl: string;
  captionBg: string;
  captionEn: string;
}

interface GalleryImageCardProps {
  /** Omitted → the "add a new photo" card. */
  image?: AdminGalleryImage;
  /** 0-based place in the gallery (existing photos only). */
  index?: number;
  total?: number;
  /** How many photos the home page shows (lib/gallery-data.ts). */
  homeCount: number;
}

const CONNECTION_ERROR = "Записът не успя — проверете връзката и опитайте отново.";

function isPlaceholder(url: string): boolean {
  return url.startsWith("/images/products/placeholder");
}

/**
 * One gallery photo in Admin → Галерия (or, without `image`, the card that
 * adds a new one). Same interaction as the category photo: pick from the
 * phone or computer, see the preview, press „Запази“. Submission is manual so
 * a failed save never resets what the owner typed or picked.
 */
export function GalleryImageCard({ image, index = 0, total = 0, homeCount }: GalleryImageCardProps) {
  const isNew = !image;
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The "new photo" card is reset by remounting it after a successful add.
  const [formKey, setFormKey] = useState(0);
  const picker = usePhotoPicker(() => {
    setResult(null);
    setConfirmDelete(false);
  });
  const { pickedFile, previewUrl, photoError, isPreparing, fileInputRef } = picker;

  const busy = isPending || isPreparing;
  const shownImage = previewUrl ?? image?.imageUrl ?? null;
  const fieldError = (name: string) => result?.fieldErrors?.[name];
  const imageError = photoError ?? fieldError("image");
  const inputId = `gallery-image-${image?.id ?? "new"}`;

  /** Runs a server action, turning a lost session into a reload to login. */
  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await action();
        setResult(res.ok && !res.message ? null : res);
        if (res.ok) onOk?.();
      } catch {
        if (await sessionExpired()) {
          window.location.reload();
          return;
        }
        setResult({ ok: false, error: CONNECTION_ERROR });
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (isNew && !pickedFile) {
      picker.setPhotoError("Първо изберете снимка.");
      return;
    }
    const formData = new FormData(e.currentTarget);
    if (pickedFile) formData.set("image", pickedFile);
    setConfirmDelete(false);
    run(
      () => (isNew ? createGalleryImageAction(null, formData) : updateGalleryImageAction(null, formData)),
      () => {
        picker.clearPicked();
        picker.setPhotoError(null);
        if (isNew) setFormKey((k) => k + 1);
      }
    );
  }

  let placeLabel: string | null = null;
  if (!isNew) {
    if (index === 0) placeLabel = "Голямата снимка на началната страница";
    else if (index < homeCount) placeLabel = "Показва се на началната страница";
    else placeLabel = "Само в страница „Галерия“";
  }

  return (
    <form
      key={formKey}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isPending}
      className={cn(
        "min-w-0 rounded-2xl border bg-white p-4",
        isNew ? "border-dashed border-pizza-green" : "border-pizza-cream-dark"
      )}
    >
      {result?.error && (
        <FormAlert tone="error" className="mb-3">
          {result.error}
        </FormAlert>
      )}
      {result?.ok && result.message && (
        <FormAlert tone="success" className="mb-3">
          {result.message}
        </FormAlert>
      )}

      {image && <input type="hidden" name="id" value={image.id} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* ── Снимка ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-2 sm:w-52 sm:shrink-0">
          {isNew ? (
            <p className="text-sm font-semibold text-pizza-green-dark">Нова снимка</p>
          ) : (
            <p className="text-sm font-semibold text-pizza-ink">
              №{index + 1}
              <span className="ml-2 font-normal text-pizza-muted">{placeLabel}</span>
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={picker.openPicker}
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-xl border border-pizza-cream-dark bg-pizza-cream/40 text-left",
              pickedFile && "ring-2 ring-pizza-green ring-offset-2"
            )}
            aria-label={shownImage ? "Смени снимката" : "Избери снимка"}
          >
            {shownImage ? (
              // A blob: preview can't go through next/image; saved photos are
              // small WebP files from the Persistent Disk anyway.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shownImage}
                alt=""
                className={cn("h-full w-full object-cover", busy && "opacity-60")}
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
                <span className="text-3xl" aria-hidden>
                  📷
                </span>
                <span className="px-2 text-xs text-pizza-muted">Натиснете, за да изберете снимка</span>
              </span>
            )}
            {!pickedFile && image && isPlaceholder(image.imageUrl) && (
              <span className="absolute inset-x-2 bottom-2 rounded-full bg-white/90 px-2 py-0.5 text-center text-[11px] font-medium text-brand-dark">
                Примерна картинка — сменете я
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES.join(",")}
            onChange={picker.handleFileChange}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <button
            type="button"
            disabled={busy}
            onClick={picker.openPicker}
            className="min-h-11 w-full rounded-full border border-pizza-green bg-white px-4 py-2.5 text-sm font-semibold text-pizza-green-dark transition hover:bg-pizza-green-light disabled:opacity-60"
          >
            {isPreparing ? "Подготовка…" : shownImage ? "Смени снимката" : "Избери снимка"}
          </button>
          {pickedFile && (
            <button
              type="button"
              disabled={isPending}
              onClick={picker.clearPicked}
              className="min-h-11 w-full rounded-full px-4 py-2 text-sm font-medium text-pizza-muted underline-offset-2 hover:text-pizza-ink hover:underline disabled:opacity-60"
            >
              Отказ от новата снимка
            </button>
          )}
          {imageError ? (
            <p className="text-xs font-medium text-brand-dark" role="alert">
              {imageError}
            </p>
          ) : pickedFile ? (
            <p className="text-xs font-medium text-pizza-green-dark">
              {isNew ? "Натиснете „Добави в галерията“." : "Новата снимка ще се запази с бутона „Запази“."}
            </p>
          ) : (
            <p className="text-xs text-pizza-muted">JPG, PNG или WebP от телефона или компютъра.</p>
          )}
        </div>

        {/* ── Надписи и действия ───────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Input
            label="Надпис (BG)"
            id={`${inputId}-bg`}
            name="captionBg"
            defaultValue={image?.captionBg ?? ""}
            error={fieldError("captionBg")}
            maxLength={60}
            placeholder="напр. Пица Маргарита"
          />
          <Input
            label="Надпис (EN)"
            id={`${inputId}-en`}
            name="captionEn"
            defaultValue={image?.captionEn ?? ""}
            error={fieldError("captionEn")}
            maxLength={60}
            placeholder="e.g. Margherita pizza (по желание)"
          />
          <p className="text-xs text-pizza-muted">
            Надписът се вижда върху снимката. Може да остане празен.
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-full bg-pizza-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
            >
              {isNew
                ? isPending
                  ? "Качване…"
                  : "Добави в галерията"
                : isPending
                  ? pickedFile
                    ? "Качване и запис…"
                    : "Запазване…"
                  : "Запази"}
            </button>

            {image && (
              <>
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => run(() => moveGalleryImageAction(image.id, "up"))}
                  className="min-h-11 min-w-11 rounded-full border border-pizza-cream-dark px-3 text-sm font-semibold text-pizza-ink transition hover:border-pizza-green disabled:opacity-40"
                  aria-label="Премести напред"
                  title="Премести напред"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={busy || index >= total - 1}
                  onClick={() => run(() => moveGalleryImageAction(image.id, "down"))}
                  className="min-h-11 min-w-11 rounded-full border border-pizza-cream-dark px-3 text-sm font-semibold text-pizza-ink transition hover:border-pizza-green disabled:opacity-40"
                  aria-label="Премести назад"
                  title="Премести назад"
                >
                  ↓
                </button>

                <div className="ml-auto flex items-center gap-2">
                  {confirmDelete ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => deleteGalleryImageAction(image.id))}
                        className="min-h-11 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
                      >
                        Да, премахни
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmDelete(false)}
                        className="min-h-11 rounded-full px-3 py-2 text-sm font-medium text-pizza-muted hover:text-pizza-ink"
                      >
                        Отказ
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                      className="min-h-11 rounded-full px-3 py-2 text-sm font-medium text-brand-dark underline-offset-2 hover:underline disabled:opacity-60"
                    >
                      Премахни
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
