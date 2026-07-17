"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginUser } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import { PasswordField } from "./PasswordField";
import type { ActionResult } from "@/types/auth";

/**
 * Login form. `redirectTo` is forwarded from the query string so the middleware
 * can send the user back where they were headed; the action only honours
 * relative paths.
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    loginUser,
    null
  );

  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <Input
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        placeholder={t("fields.emailPlaceholder")}
        error={fieldErrors.email}
      />

      <PasswordField
        label={t("fields.password")}
        name="password"
        autoComplete="current-password"
        error={fieldErrors.password}
      />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? t("signingIn") : t("login.submit")}
      </button>
    </form>
  );
}
