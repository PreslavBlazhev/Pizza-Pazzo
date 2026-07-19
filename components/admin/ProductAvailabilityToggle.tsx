"use client";

import { useActionState } from "react";
import { toggleProductAvailabilityAction } from "@/app/actions/admin-menu";
import type { ActionResult } from "@/types/auth";

/**
 * The one-click "sold out" switch on the products list. STAFF may use it (the
 * action re-checks). The row's availability badge re-renders from the server
 * after the action revalidates, so no local state is kept here.
 */
export function ProductAvailabilityToggle({
  productId,
  isAvailable,
}: {
  productId: string;
  isAvailable: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    toggleProductAvailabilityAction,
    null
  );

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={isPending}
        title={isAvailable ? "Скрий от менюто (изчерпан)" : "Върни в менюто"}
        className={
          isAvailable
            ? "rounded-full border border-pizza-cream-dark px-3 py-1 text-xs font-semibold text-pizza-muted transition hover:border-brand hover:text-brand disabled:opacity-60"
            : "rounded-full bg-pizza-green px-3 py-1 text-xs font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
        }
      >
        {isPending ? "…" : isAvailable ? "Скрий" : "Покажи"}
      </button>
      {state?.ok === false && state.error && (
        <span role="alert" className="ml-2 text-xs font-medium text-brand">
          {state.error}
        </span>
      )}
    </form>
  );
}
