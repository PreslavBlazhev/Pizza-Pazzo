"use client";

import { useActionState } from "react";
import { setCardDemoModeAction } from "@/app/actions/admin-card-demo";
import { FormAlert } from "@/components/ui/FormAlert";
import { CARD_DEMO_MODES, type CardDemoMode } from "@/lib/payments/demo-modes";
import type { ActionResult } from "@/types/auth";

const DESCRIPTIONS: Record<CardDemoMode, { title: string; text: string }> = {
  OFF: {
    title: "Изключено",
    text: "Никой не вижда картово плащане (освен ако не е настроена истинска банка).",
  },
  STAFF: {
    title: "Само за влезли служители и админи",
    text: "Влезте с админ/служебен акаунт и в checkout ще има „Демо плащане с карта“. Клиентите не го виждат.",
  },
  EVERYONE: {
    title: "За всички посетители",
    text: "Всеки вижда демото. Внимание: клиент, който го избере, прави ТЕСТОВА поръчка, която не се приготвя.",
  },
};

/** The live-site card demo switch (Admin → Settings). */
export function CardDemoModeForm({ mode }: { mode: CardDemoMode }) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    setCardDemoModeAction,
    null
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold text-pizza-ink">
          Демо плащане с карта на този сайт (тестов симулатор, без реални пари)
        </legend>
        {CARD_DEMO_MODES.map((m) => (
          <label
            key={m}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-pizza-cream-dark p-3 has-[:checked]:border-pizza-green has-[:checked]:bg-pizza-green-light/40"
          >
            <input
              type="radio"
              name="cardDemoMode"
              value={m}
              defaultChecked={m === mode}
              className="mt-1 h-4 w-4 accent-pizza-green"
            />
            <span>
              <span className="block text-sm font-semibold text-pizza-ink">{DESCRIPTIONS[m].title}</span>
              <span className="block text-xs text-pizza-muted">{DESCRIPTIONS[m].text}</span>
            </span>
          </label>
        ))}
      </fieldset>
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
