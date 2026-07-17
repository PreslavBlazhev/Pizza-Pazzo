"use client";

import { useActionState } from "react";
import { registerUser } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import { PasswordField } from "./PasswordField";
import type { ActionResult } from "@/types/auth";

/** Registration form. Validation and account creation happen in the action. */
export function RegisterForm() {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    registerUser,
    null
  );

  const fieldErrors = state?.fieldErrors ?? {};

  return (
    // noValidate: the browser's own English bubbles would compete with our
    // Bulgarian messages from zod.
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

      <Input
        label="Име и фамилия"
        name="fullName"
        autoComplete="name"
        placeholder="Иван Петров"
        error={fieldErrors.fullName}
      />

      <Input
        label="Имейл"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="ivan@example.com"
        error={fieldErrors.email}
      />

      <Input
        label="Телефон"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="0888123456"
        hint="За връзка при доставка."
        error={fieldErrors.phone}
      />

      <PasswordField
        label="Парола"
        name="password"
        autoComplete="new-password"
        hint="Минимум 8 символа."
        error={fieldErrors.password}
      />

      <PasswordField
        label="Потвърди паролата"
        name="confirmPassword"
        autoComplete="new-password"
        error={fieldErrors.confirmPassword}
      />

      <div>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-pizza-muted">
          <input
            type="checkbox"
            name="acceptedTerms"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
          />
          {/* TODO: link "Общи условия" and "Политика за поверителност" once those
              pages exist. Left as plain text on purpose — a dead link on a legal
              consent checkbox is worse than no link. */}
          <span>
            Съгласен съм с Общите условия и Политиката за поверителност.
          </span>
        </label>
        {fieldErrors.acceptedTerms && (
          <span role="alert" className="mt-1.5 block text-xs font-medium text-brand">
            {fieldErrors.acceptedTerms}
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Създаване…" : "Създай профил"}
      </button>
    </form>
  );
}
