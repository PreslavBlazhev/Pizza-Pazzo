"use client";

import { useActionState } from "react";
import { updateCategoryAction } from "@/app/actions/admin-menu";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import type { AdminMenuCategory } from "@/lib/admin-menu";
import type { ActionResult } from "@/types/auth";

/** Inline editor for one category row (ADMIN+ — the action re-checks). */
export function CategoryEditForm({ category }: { category: AdminMenuCategory }) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    updateCategoryAction,
    null
  );
  const fieldError = (name: string) => state?.fieldErrors?.[name];

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-pizza-cream-dark bg-white p-4"
      noValidate
    >
      {state?.error && (
        <FormAlert tone="error" className="mb-3">
          {state.error}
        </FormAlert>
      )}
      {state?.ok && state.message && (
        <FormAlert tone="success" className="mb-3">
          {state.message}
        </FormAlert>
      )}

      <input type="hidden" name="categoryId" value={category.id} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          label="Икона"
          name="icon"
          defaultValue={category.icon ?? ""}
          error={fieldError("icon")}
          hint="Емоджи, напр. 🍕"
        />
        <Input
          label="Ред"
          name="sortOrder"
          defaultValue={String(category.sortOrder)}
          error={fieldError("sortOrder")}
          inputMode="numeric"
        />
        <div className="flex flex-col justify-end gap-2 pb-0.5">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={category.isActive}
              className="h-4 w-4 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
            />
            <span className="text-sm font-medium text-pizza-ink">Активна</span>
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-pizza-green px-5 py-2 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
          >
            {isPending ? "Запазване…" : "Запази"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-pizza-muted">
        {category.productCount} продукта · адрес: /menu/{category.slug} (не се
        променя)
      </p>
    </form>
  );
}
