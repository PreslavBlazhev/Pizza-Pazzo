"use client";

import { useActionState } from "react";
import { createAdminUser } from "@/app/actions/admin-users";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import { PasswordField } from "@/components/auth/PasswordField";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type ActionResult } from "@/types/auth";

/**
 * Creates a staff/admin account. super_admin only.
 *
 * The role options stop at "admin" on purpose — a super_admin can only be made
 * by manual SQL, so a compromised admin session cannot mint one.
 */
export function CreateAdminUserForm({ onDone }: { onDone?: () => void }) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    createAdminUser,
    null
  );

  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}

      <Input label="Име и фамилия" name="fullName" autoComplete="off" error={fieldErrors.fullName} />
      <Input label="Имейл" name="email" type="email" autoComplete="off" error={fieldErrors.email} />
      <Input
        label="Телефон"
        name="phone"
        type="tel"
        autoComplete="off"
        placeholder="0888123456"
        error={fieldErrors.phone}
      />
      <PasswordField
        label="Временна парола"
        name="password"
        autoComplete="new-password"
        hint="Минимум 8 символа. Дайте я на служителя и го помолете да я смени."
        error={fieldErrors.password}
      />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-pizza-ink">Роля</legend>
        {(["staff", "admin"] as const).map((role) => (
          <label
            key={role}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-pizza-cream-dark p-3 transition hover:border-pizza-green/50"
          >
            <input
              type="radio"
              name="role"
              value={role}
              defaultChecked={role === "staff"}
              className="mt-1 h-4 w-4 border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
            />
            <span>
              <span className="block text-sm font-semibold text-pizza-ink">
                {ROLE_LABELS[role]}
              </span>
              <span className="block text-xs text-pizza-muted">
                {ROLE_DESCRIPTIONS[role]}
              </span>
            </span>
          </label>
        ))}
        {fieldErrors.role && (
          <span role="alert" className="block text-xs font-medium text-brand">
            {fieldErrors.role}
          </span>
        )}
      </fieldset>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-pizza-green px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
        >
          {isPending ? "Създаване…" : "Създай профил"}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-pizza-cream-dark px-6 py-2.5 text-sm font-semibold text-pizza-muted transition hover:text-pizza-ink"
          >
            Затвори
          </button>
        )}
      </div>
    </form>
  );
}
