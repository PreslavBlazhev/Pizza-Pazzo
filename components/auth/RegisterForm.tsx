"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { registerUser } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import { PasswordField } from "./PasswordField";
import type { ActionResult } from "@/types/auth";

/** Registration form. Validation and account creation happen in the action. */
export function RegisterForm() {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    registerUser,
    null
  );

  const fieldErrors = state?.fieldErrors ?? {};

  return (
    // noValidate: the browser's own bubbles are in its UI language, which is not
    // necessarily the site's, and would compete with our messages from zod.
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

      <Input
        label={t("fields.fullName")}
        name="fullName"
        autoComplete="name"
        placeholder={t("fields.fullNamePlaceholder")}
        error={fieldErrors.fullName}
      />

      <Input
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        placeholder={t("fields.emailPlaceholder")}
        error={fieldErrors.email}
      />

      <Input
        label={t("fields.phone")}
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder={t("fields.phonePlaceholder")}
        hint={t("fields.phoneHint")}
        error={fieldErrors.phone}
      />

      <PasswordField
        label={t("fields.password")}
        name="password"
        autoComplete="new-password"
        hint={t("fields.passwordHint")}
        error={fieldErrors.password}
      />

      <PasswordField
        label={t("fields.passwordConfirm")}
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
          {/* target="_blank" so opening a policy doesn't wipe the half-filled form. */}
          <span>
            {t.rich("acceptTerms", {
              terms: (chunks) => (
                <Link
                  href="/terms"
                  target="_blank"
                  className="underline transition hover:text-brand"
                >
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link
                  href="/privacy"
                  target="_blank"
                  className="underline transition hover:text-brand"
                >
                  {chunks}
                </Link>
              ),
            })}
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
        {isPending ? t("creating") : t("createAccount")}
      </button>
    </form>
  );
}
