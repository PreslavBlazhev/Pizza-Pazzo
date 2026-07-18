"use client";

import { useState, useActionState } from "react";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS_BG } from "@/lib/order-status";
import { updateOrderStatusAction } from "@/app/actions/order-admin";
import { FormAlert } from "@/components/ui/FormAlert";
import type { OrderStatus } from "@/types/order";
import type { ActionResult } from "@/types/auth";

const QUICK_TIMES = [20, 30, 45, 60];

/**
 * Controls for the allowed next statuses of an order. Staff+ only.
 * ACCEPTED asks for an estimated time (quick picks or custom) and an optional
 * note; CANCELLED asks for an optional reason. Everything else is one button.
 */
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
  const [quickTime, setQuickTime] = useState(30);
  const [customTime, setCustomTime] = useState("");

  const nextStatuses = ORDER_STATUS_FLOW[status];
  const canAccept = nextStatuses.includes("ACCEPTED");
  const canCancel = nextStatuses.includes("CANCELLED");
  const plainStatuses = nextStatuses.filter((s) => s !== "ACCEPTED" && s !== "CANCELLED");

  // A filled-in custom time wins over the quick picks; the server validates it.
  const resolvedTime = customTime.trim() === "" ? String(quickTime) : customTime.trim();

  return (
    <div className="space-y-4">
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}

      {nextStatuses.length === 0 && (
        <p className="text-sm text-neutral-500">Поръчката е в краен статус.</p>
      )}

      {canAccept && (
        <form action={formAction} className="rounded-xl border border-pizza-green/30 bg-pizza-green/5 p-3">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="status" value="ACCEPTED" />
          <input type="hidden" name="estimatedTimeMinutes" value={resolvedTime} />

          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Ориентировъчно време
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {QUICK_TIMES.map((t) => {
              const selected = customTime.trim() === "" && quickTime === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setQuickTime(t);
                    setCustomTime("");
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                    selected
                      ? "border-pizza-green bg-pizza-green text-white"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-pizza-green/60"
                  }`}
                >
                  {t} мин
                </button>
              );
            })}
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              Друго:
              <input
                type="number"
                min={1}
                max={480}
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                placeholder="мин"
                className="w-20 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-pizza-green focus:outline-none"
              />
            </label>
          </div>

          <input
            type="text"
            name="adminNote"
            maxLength={500}
            placeholder="Бележка (по избор)"
            className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-pizza-green focus:outline-none"
          />

          <button
            type="submit"
            disabled={isPending}
            className="mt-3 rounded-full bg-pizza-green px-5 py-2 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
          >
            {isPending ? "Записване…" : `→ Прието (${resolvedTime || "?"} мин)`}
          </button>
        </form>
      )}

      {plainStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plainStatuses.map((s) => (
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

      {canCancel && (
        <form action={formAction} className="rounded-xl border border-red-200 bg-red-50/50 p-3">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="status" value="CANCELLED" />
          <input
            type="text"
            name="adminNote"
            maxLength={500}
            placeholder="Причина за отказ (по избор)"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className="mt-3 rounded-full border border-red-300 bg-white px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-600 hover:text-white disabled:opacity-60"
          >
            {isPending ? "Записване…" : "→ Отказано"}
          </button>
        </form>
      )}
    </div>
  );
}
