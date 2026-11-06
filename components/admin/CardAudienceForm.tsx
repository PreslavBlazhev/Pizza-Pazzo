"use client";

import { useActionState } from "react";
import { setCardProductionAudienceAction } from "@/app/actions/admin-card-audience";
import { FormAlert } from "@/components/ui/FormAlert";
import type { ActionResult } from "@/types/auth";

/**
 * "Реално плащане с карта — достъпно за всички клиенти" (Admin → Settings).
 * Drives the real availability: the stored value replaces the server's
 * PAYMENT_PRODUCTION_AUDIENCE (lib/payments/production-audience.ts).
 */
export function CardAudienceForm({
  publicCard,
  bankReady,
}: {
  /** The EFFECTIVE audience is everyone (what the site does now). */
  publicCard: boolean;
  /** The production terminal is configured and valid on the server. */
  bankReady: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    setCardProductionAudienceAction,
    null
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      <input type="hidden" name="intent" value="card-audience" />
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-pizza-cream-dark p-3 has-[:checked]:border-pizza-green has-[:checked]:bg-pizza-green-light/40">
        <input
          type="checkbox"
          name="publicCard"
          defaultChecked={publicCard}
          className="mt-1 h-4 w-4 accent-pizza-green"
        />
        <span>
          <span className="block text-sm font-semibold text-pizza-ink">
            Реално плащане с карта — достъпно за всички клиенти
          </span>
          <span className="block text-xs text-pizza-muted">
            Включено: гости и регистрирани клиенти виждат „Плащане онлайн с карта“ и плащат на
            реалната страница на ОББ. Изключено: картата се предлага само на влезлия персонал.
            {!bankReady && " Банковият терминал на сървъра не е активен — докато е така, картата не се предлага на никого."}
          </span>
        </span>
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-pizza-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
      >
        {isPending ? "Запазване…" : "Запази"}
      </button>
    </form>
  );
}
