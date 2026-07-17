"use client";

import { useActionState, useEffect, useState } from "react";
import { updateProfile } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import type { ActionResult, Profile } from "@/types/auth";

/**
 * Read-only profile details that swap to an edit form in place.
 * The email is shown but not editable — changing it in Supabase requires a
 * confirmation flow on both addresses, which is out of scope for this stage.
 */
export function ProfileEditForm({ profile, email }: { profile: Profile | null; email: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null
  );

  // Close the editor once the server confirms the save.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state?.ok]);

  const fieldErrors = state?.fieldErrors ?? {};

  if (!editing) {
    return (
      <div className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
        {state?.ok && state.message && (
          <FormAlert tone="success" className="mb-5">
            {state.message}
          </FormAlert>
        )}

        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold text-pizza-ink">
            Лични данни
          </h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full border border-pizza-cream-dark px-4 py-2 text-sm font-semibold text-pizza-ink transition hover:border-pizza-green hover:text-pizza-green"
          >
            Редактирай профил
          </button>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-pizza-muted">Име</dt>
            <dd className="mt-1 font-medium text-pizza-ink">
              {profile?.fullName || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-pizza-muted">Имейл</dt>
            <dd className="mt-1 break-all font-medium text-pizza-ink">{email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-pizza-muted">Телефон</dt>
            <dd className="mt-1 font-medium text-pizza-ink">{profile?.phone || "—"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-semibold text-pizza-ink">
        Редакция на профила
      </h2>

      <form action={formAction} className="mt-5 space-y-4" noValidate>
        {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

        <Input
          label="Име и фамилия"
          name="fullName"
          defaultValue={profile?.fullName ?? ""}
          autoComplete="name"
          error={fieldErrors.fullName}
        />

        <Input
          label="Телефон"
          name="phone"
          type="tel"
          defaultValue={profile?.phone ?? ""}
          autoComplete="tel"
          error={fieldErrors.phone}
        />

        {/* defaultValue, not value: a controlled input with no onChange warns. */}
        <Input
          label="Имейл"
          name="email"
          defaultValue={email}
          disabled
          hint="Имейлът не може да се променя."
        />

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-pizza-green px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
          >
            {isPending ? "Запазване…" : "Запази"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-pizza-cream-dark px-6 py-2.5 text-sm font-semibold text-pizza-muted transition hover:text-pizza-ink"
          >
            Отказ
          </button>
        </div>
      </form>
    </div>
  );
}
