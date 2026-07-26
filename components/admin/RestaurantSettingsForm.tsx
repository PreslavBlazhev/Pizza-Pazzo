"use client";

import { useActionState, useState } from "react";
import { updateRestaurantSettingsAction } from "@/app/actions/admin-settings";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import { WEEKDAYS, type RestaurantSettingsData, type Weekday } from "@/types/settings";
import type { ActionResult } from "@/types/auth";
import { cn } from "@/lib/utils";

/** Bulgarian weekday names — the admin panel is BG-only by design. */
const DAY_LABELS: Record<Weekday, string> = {
  monday: "Понеделник",
  tuesday: "Вторник",
  wednesday: "Сряда",
  thursday: "Четвъртък",
  friday: "Петък",
  saturday: "Събота",
  sunday: "Неделя",
};

/**
 * Contact details + opening hours editor (ADMIN+; the action re-checks).
 *
 * One form, one save. The open/closed switches are local state only so the
 * time inputs can be disabled live; everything else is uncontrolled and read
 * from FormData on the server.
 */
export function RestaurantSettingsForm({
  settings,
}: {
  settings: RestaurantSettingsData;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    updateRestaurantSettingsAction,
    null
  );

  const [openDays, setOpenDays] = useState<Record<Weekday, boolean>>(() =>
    Object.fromEntries(WEEKDAYS.map((d) => [d, settings.hours[d].open])) as Record<
      Weekday,
      boolean
    >
  );

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  return (
    <form action={formAction} className="mt-6 space-y-6" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && (
        <FormAlert tone="success">{state.message}</FormAlert>
      )}

      {/* ── Contact details ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-pizza-cream-dark bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-pizza-ink">Контакти</h2>
        <p className="mt-1 text-sm text-pizza-muted">
          Показват се във футъра, на страница „Контакти“ и в структурираните данни.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Адрес (BG)"
            name="addressBg"
            defaultValue={settings.addressBg}
            error={fieldError("addressBg")}
            required
          />
          <Input
            label="Адрес (EN)"
            name="addressEn"
            defaultValue={settings.addressEn}
            error={fieldError("addressEn")}
            hint="Показва се на английската версия на сайта."
            required
          />
          <Input
            label="Основен телефон"
            name="primaryPhone"
            type="tel"
            defaultValue={settings.primaryPhone}
            error={fieldError("primaryPhone")}
            required
          />
          <Input
            label="Допълнителен телефон"
            name="secondaryPhone"
            type="tel"
            defaultValue={settings.secondaryPhone}
            error={fieldError("secondaryPhone")}
            hint="Оставете празно, ако няма втори номер."
          />
          <Input
            label="Контактен имейл"
            name="contactEmail"
            type="email"
            defaultValue={settings.contactEmail}
            error={fieldError("contactEmail")}
            hint="Показва се на клиентите. Не променя адреса, от който тръгват имейлите."
            required
          />
        </div>
      </section>

      {/* ── Opening hours ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-pizza-cream-dark bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-pizza-ink">
          Работно време
        </h2>
        <p className="mt-1 text-sm text-pizza-muted">
          Изключете деня, за да се показва като „Затворено“.
        </p>

        <ul className="mt-4 space-y-2">
          {WEEKDAYS.map((day) => {
            const isOpen = openDays[day];
            const fromError = fieldError(`hours.${day}.from`);
            const toError = fieldError(`hours.${day}.to`);
            return (
              <li
                key={day}
                className={cn(
                  "rounded-xl border px-4 py-3 transition",
                  isOpen ? "border-pizza-cream-dark bg-white" : "border-pizza-cream-dark bg-pizza-cream/50"
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2.5 text-sm font-medium text-pizza-ink sm:w-56">
                    <input
                      type="checkbox"
                      name={`${day}.open`}
                      checked={isOpen}
                      onChange={(e) =>
                        setOpenDays((prev) => ({ ...prev, [day]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/40"
                    />
                    {DAY_LABELS[day]}
                  </label>

                  {isOpen ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-pizza-muted">
                        От
                        <input
                          type="time"
                          name={`${day}.from`}
                          defaultValue={settings.hours[day].from ?? "11:00"}
                          aria-invalid={fromError ? true : undefined}
                          className={cn(
                            "rounded-xl border bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition focus:border-pizza-green focus:ring-2 focus:ring-pizza-green/25",
                            fromError ? "border-brand" : "border-pizza-cream-dark"
                          )}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-pizza-muted">
                        До
                        <input
                          type="time"
                          name={`${day}.to`}
                          defaultValue={settings.hours[day].to ?? "23:00"}
                          aria-invalid={toError ? true : undefined}
                          className={cn(
                            "rounded-xl border bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition focus:border-pizza-green focus:ring-2 focus:ring-pizza-green/25",
                            toError ? "border-brand" : "border-pizza-cream-dark"
                          )}
                        />
                      </label>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-brand">Затворено</span>
                  )}
                </div>

                {(fromError || toError) && (
                  <p role="alert" className="mt-2 text-xs font-medium text-brand">
                    {fromError ?? toError}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex items-center gap-4 border-t border-pizza-cream-dark pt-5">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-pizza-green px-8 py-3 text-sm font-semibold text-white transition hover:bg-pizza-green-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/40 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isPending ? "Запазване…" : "Запази настройките"}
        </button>
      </div>
    </form>
  );
}
