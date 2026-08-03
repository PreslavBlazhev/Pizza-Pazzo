"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { updateProductAction } from "@/app/actions/admin-menu";
import { ALLERGEN_IDS } from "@/lib/allergens";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FormAlert } from "@/components/ui/FormAlert";
import { ProductImageUploadField } from "./ProductImageUploadField";
import type { AdminMenuCategory, AdminMenuProduct } from "@/lib/admin-menu";
import type { ActionResult } from "@/types/auth";

/**
 * Full product editor (ADMIN+ — the action re-checks). Slug and id are shown
 * but not editable: the slug is a public URL and the id is referenced from
 * order history. Variants can be renamed and re-priced, not added/removed
 * (MVP — see docs/admin-menu-db-plan.md).
 */
export function ProductEditForm({
  product,
  categories,
}: {
  product: AdminMenuProduct;
  categories: AdminMenuCategory[];
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    updateProductAction,
    null
  );
  const tAllergens = useTranslations("allergens");
  const fieldError = (name: string) => state?.fieldErrors?.[name];
  const [imageUploading, setImageUploading] = useState(false);

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {/* Only errors surface here: a successful save redirects to the product
          list, so the action never returns an ok result to this form. */}
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

      <input type="hidden" name="productId" value={product.id} />

      {/* Names + descriptions */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Име (BG)"
          name="nameBg"
          defaultValue={product.nameBg}
          error={fieldError("nameBg")}
          required
        />
        <Input
          label="Име (EN)"
          name="nameEn"
          defaultValue={product.nameEn}
          error={fieldError("nameEn")}
          hint="Празно поле показва българското име и на английския сайт."
        />
        <Textarea
          label="Описание (BG)"
          name="descriptionBg"
          defaultValue={product.descriptionBg}
          error={fieldError("descriptionBg")}
          rows={3}
        />
        <Textarea
          label="Описание (EN)"
          name="descriptionEn"
          defaultValue={product.descriptionEn}
          error={fieldError("descriptionEn")}
          rows={3}
        />
      </section>

      {/* Category / prices / image */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoryId" className="text-sm font-medium text-pizza-ink">
            Категория
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product.categoryId}
            className="rounded-xl border border-pizza-cream-dark bg-white px-3.5 py-2.5 text-sm text-pizza-ink outline-none transition focus:border-pizza-green focus:ring-2 focus:ring-pizza-green/25"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameBg}
              </option>
            ))}
          </select>
          {fieldError("categoryId") && (
            <span role="alert" className="text-xs font-medium text-brand">
              {fieldError("categoryId")}
            </span>
          )}
        </div>
        <Input
          label={product.variants.length > 0 ? "Базова цена € („от“)" : "Цена €"}
          name="priceEur"
          defaultValue={product.priceEur.toFixed(2)}
          error={fieldError("priceEur")}
          inputMode="decimal"
          required
        />
        <Input
          label="Грамаж (BG)"
          name="sizeBg"
          defaultValue={product.sizeBg ?? ""}
          error={fieldError("sizeBg")}
          hint="Напр. „300 г“ или „330 мл“"
        />
        <Input
          label="Грамаж (EN)"
          name="sizeEn"
          defaultValue={product.sizeEn ?? ""}
          error={fieldError("sizeEn")}
        />
        <Input
          label="Ред в категорията"
          name="sortOrder"
          defaultValue={String(product.sortOrder)}
          error={fieldError("sortOrder")}
          inputMode="numeric"
        />
        <ProductImageUploadField
          defaultValue={product.imageUrl ?? ""}
          error={fieldError("imageUrl")}
          onUploadingChange={setImageUploading}
        />
      </section>

      {/* Flags */}
      <section className="flex flex-wrap gap-x-8 gap-y-3">
        {(
          [
            ["isAvailable", "Наличен (вижда се в менюто)", product.isAvailable],
            ["isPopular", "Популярен (в „Най-поръчвани“)", product.isPopular],
            ["isNew", "Нов (значка „Ново“)", product.isNew],
          ] as const
        ).map(([name, label, checked]) => (
          <label key={name} className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name={name}
              defaultChecked={checked}
              className="h-4 w-4 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
            />
            <span className="text-sm font-medium text-pizza-ink">{label}</span>
          </label>
        ))}
      </section>

      {/* Variants */}
      {product.variants.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-pizza-ink">
            Варианти (размери)
          </h2>
          <div className="space-y-3">
            {product.variants.map((v) => (
              <div
                key={v.id}
                className="grid gap-3 rounded-2xl border border-pizza-cream-dark bg-pizza-cream/30 p-4 sm:grid-cols-4"
              >
                <Input
                  label="Име (BG)"
                  name={`variant-${v.id}-nameBg`}
                  defaultValue={v.nameBg}
                  required
                />
                <Input
                  label="Име (EN)"
                  name={`variant-${v.id}-nameEn`}
                  defaultValue={v.nameEn}
                />
                <Input
                  label="Цена €"
                  name={`variant-${v.id}-priceEur`}
                  defaultValue={v.priceEur.toFixed(2)}
                  inputMode="decimal"
                  required
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-pizza-muted">
            Добавяне и премахване на варианти засега става от разработчик —
            вариантите участват в стари поръчки.
          </p>
        </section>
      )}

      {/* Allergens */}
      <section>
        <h2 className="mb-1 font-display text-lg font-semibold text-pizza-ink">
          Алергени
        </h2>
        <p className="mb-3 text-sm text-pizza-muted">
          Отбележете всички алергени, които продуктът съдържа (ЕС 1169/2011).
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ALLERGEN_IDS.map((id) => (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-pizza-cream-dark px-3 py-2 transition hover:border-pizza-green/50"
            >
              <input
                type="checkbox"
                name="allergens"
                value={id}
                defaultChecked={product.allergens.includes(id)}
                className="h-4 w-4 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
              />
              <span className="text-sm text-pizza-ink">{tAllergens(`${id}.name`)}</span>
            </label>
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="allergensUnverified"
            defaultChecked={product.allergensUnverified}
            className="mt-0.5 h-4 w-4 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
          />
          <span className="text-sm text-pizza-ink">
            Алергените НЕ са потвърдени от кухнята
            <span className="block text-xs text-pizza-muted">
              Сайтът показва „Информацията за алергени се уточнява. Попитайте
              персонала.“ Махнете отметката, след като кухнята потвърди.
            </span>
          </span>
        </label>
        {fieldError("allergens") && (
          <span role="alert" className="mt-2 block text-xs font-medium text-brand">
            {fieldError("allergens")}
          </span>
        )}
      </section>

      <div className="flex items-center gap-4 border-t border-pizza-cream-dark pt-5">
        <button
          type="submit"
          disabled={isPending || imageUploading}
          className="rounded-full bg-pizza-green px-8 py-3 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
        >
          {isPending ? "Запазване…" : imageUploading ? "Изчакайте качването…" : "Запази продукта"}
        </button>
      </div>
    </form>
  );
}
