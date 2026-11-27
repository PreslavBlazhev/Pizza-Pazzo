"use client";

import { useState, useTransition } from "react";
import { updateCategoryAction } from "@/app/actions/admin-menu";
import { ACCEPTED_PHOTO_TYPES, sessionExpired, usePhotoPicker } from "@/components/admin/usePhotoPicker";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import type { AdminMenuCategory } from "@/lib/admin-menu";
import type { ActionResult } from "@/types/auth";
import { cn } from "@/lib/utils";

/**
 * Inline editor for one category row (ADMIN+ — the action re-checks).
 *
 * The photo is picked with a plain file input (gallery or files on a phone —
 * no `capture`, so the camera is never forced), previewed immediately, and
 * sent with the row's "Запази" together with the other fields. Submission is
 * manual (not `<form action>`) so a failed save never resets what the owner
 * typed or picked: React resets action-driven forms after every submit.
 */
export function CategoryEditForm({ category }: { category: AdminMenuCategory }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    pickedFile,
    previewUrl,
    photoError,
    setPhotoError,
    isPreparing,
    fileInputRef,
    handleFileChange,
    clearPicked,
  } = usePhotoPicker(() => setResult(null));

  const fieldError = (name: string) => result?.fieldErrors?.[name];
  const shownImage = previewUrl ?? category.imageUrl;
  const busy = isPending || isPreparing;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const formData = new FormData(e.currentTarget);
    if (pickedFile) formData.set("image", pickedFile);

    setResult(null);
    startTransition(async () => {
      try {
        const res = await updateCategoryAction(null, formData);
        setResult(res);
        if (res.ok) {
          // The revalidated page now carries the saved photo path.
          clearPicked();
          setPhotoError(null);
        }
      } catch {
        // An expired session makes the proxy answer the action with a
        // redirect to the login page, which surfaces here as a generic
        // failure. If that's the reason, reload: the proxy then takes the
        // owner to the login page (and back here afterwards).
        if (await sessionExpired()) {
          window.location.reload();
          return;
        }
        setResult({
          ok: false,
          error: "Записът не успя — проверете връзката и опитайте отново.",
        });
      }
    });
  }

  const imageError = photoError ?? fieldError("image");

  return (
    <form
      onSubmit={handleSubmit}
      className="min-w-0 rounded-2xl border border-pizza-cream-dark bg-white p-4"
      noValidate
      aria-busy={isPending}
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

      <input type="hidden" name="categoryId" value={category.id} />

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* ── Снимка ─────────────────────────────────────────────── */}
        <fieldset className="min-w-0 md:w-48 md:shrink-0">
          <legend className="mb-1.5 text-sm font-medium text-pizza-ink">Снимка</legend>
          <div className="flex items-center gap-3 md:flex-col md:items-stretch">
            <div
              className={cn(
                "relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-xl border border-pizza-cream-dark bg-pizza-cream/40 sm:w-40 md:w-full",
                pickedFile && "ring-2 ring-pizza-green ring-offset-2"
              )}
            >
              {shownImage ? (
                // A blob: preview can't go through next/image; the saved
                // photo is a small WebP from the Persistent Disk anyway.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shownImage}
                  alt={
                    pickedFile
                      ? `Нова снимка за „${category.nameBg}“ (не е запазена)`
                      : `Снимка на категория „${category.nameBg}“`
                  }
                  className={cn("h-full w-full object-cover", busy && "opacity-60")}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
                  {category.icon && (
                    <span className="text-3xl" aria-hidden>
                      {category.icon}
                    </span>
                  )}
                  <span className="px-2 text-[11px] text-pizza-muted">Няма снимка</span>
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                ref={fileInputRef}
                id={`category-image-${category.id}`}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES.join(",")}
                onChange={handleFileChange}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-11 w-full rounded-full border border-pizza-green bg-white px-4 py-2.5 text-sm font-semibold text-pizza-green-dark transition hover:bg-pizza-green-light disabled:opacity-60"
              >
                {isPreparing
                  ? "Подготовка…"
                  : shownImage
                    ? "Смени снимката"
                    : "Добави снимка"}
              </button>
              {pickedFile && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={clearPicked}
                  className="min-h-11 w-full rounded-full px-4 py-2 text-sm font-medium text-pizza-muted underline-offset-2 hover:text-pizza-ink hover:underline disabled:opacity-60"
                >
                  Отказ от новата снимка
                </button>
              )}
            </div>
          </div>
          {pickedFile && !imageError && (
            <p className="mt-2 text-xs font-medium text-pizza-green-dark">
              Новата снимка ще се запази с бутона „Запази“.
            </p>
          )}
          {!pickedFile && !imageError && (
            <p className="mt-2 text-xs text-pizza-muted">JPG, PNG или WebP от телефона или компютъра.</p>
          )}
          {imageError && (
            <p className="mt-2 text-xs font-medium text-brand-dark" role="alert">
              {imageError}
            </p>
          )}
        </fieldset>

        {/* ── Текстови полета ───────────────────────────────────── */}
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Име (BG)"
            name="nameBg"
            defaultValue={category.nameBg}
            error={fieldError("nameBg")}
            required
          />
          <Input
            label="Име (EN)"
            name="nameEn"
            defaultValue={category.nameEn}
            error={fieldError("nameEn")}
          />
          <Input
            label="Ред"
            name="sortOrder"
            defaultValue={String(category.sortOrder)}
            error={fieldError("sortOrder")}
            inputMode="numeric"
          />
          <div className="flex flex-col justify-end gap-2 pb-0.5">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={category.isActive}
                className="h-5 w-5 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
              />
              <span className="text-sm font-medium text-pizza-ink">Активна</span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-full bg-pizza-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
            >
              {isPending ? (pickedFile ? "Качване и запис…" : "Запазване…") : "Запази"}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-pizza-muted">
        {category.productCount} продукта · адрес: /menu/{category.slug} (не се
        променя)
      </p>
    </form>
  );
}
