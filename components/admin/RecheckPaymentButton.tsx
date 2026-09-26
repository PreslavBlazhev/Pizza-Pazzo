"use client";

import { useActionState } from "react";
import { recheckOrderPaymentAction } from "@/app/actions/admin-payments";
import { FormAlert } from "@/components/ui/FormAlert";
import type { ActionResult } from "@/types/auth";

/** "Провери при доставчика" — re-runs the server-to-server status check. */
export function RecheckPaymentButton({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    recheckOrderPaymentAction,
    null
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
      >
        {isPending ? "Проверява се…" : "Провери плащането при доставчика"}
      </button>
    </form>
  );
}
