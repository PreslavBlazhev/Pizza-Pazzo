"use client";

import { useActionState } from "react";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS_BG } from "@/lib/order-status";
import { updateOrderStatusAction } from "@/app/actions/order-admin";
import { FormAlert } from "@/components/ui/FormAlert";
import type { OrderStatus } from "@/types/order";
import type { ActionResult } from "@/types/auth";

/** Buttons for the allowed next statuses of an order. Staff+ only. */
export function OrderStatusControl({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    updateOrderStatusAction,
    null
  );

  const nextStatuses = ORDER_STATUS_FLOW[status];

  return (
    <div className="space-y-3">
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}

      {nextStatuses.length === 0 ? (
        <p className="text-sm text-neutral-500">Поръчката е в краен статус.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((s) => (
            <form key={s} action={formAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                disabled={isPending}
                className="rounded-full border border-pizza-green/40 bg-white px-4 py-2 text-sm font-semibold text-pizza-green-dark transition hover:bg-pizza-green hover:text-white disabled:opacity-60"
              >
                → {ORDER_STATUS_LABELS_BG[s]}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
