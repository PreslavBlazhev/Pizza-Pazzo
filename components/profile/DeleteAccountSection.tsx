"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { deleteOwnAccount } from "@/app/actions/auth";
import { PasswordField } from "@/components/auth/PasswordField";
import { FormAlert } from "@/components/ui/FormAlert";
import type { ActionResult } from "@/types/auth";

/**
 * "Delete my account" — the in-app deletion path Google Play requires of every
 * app that lets people create an account (the kitchen app opens this site,
 * registration included, inside its WebView).
 *
 * Deliberately two steps and password-confirmed. It is the only destructive,
 * irreversible action a customer can take on their own, and the site is used on
 * shared devices — a phone left unlocked on a table, the tablet on the counter.
 * One stray tap must not be enough.
 *
 * The section says plainly what survives: past orders stay as accounting
 * records, detached from the account. Play's policy requires that any retention
 * be disclosed, and a customer deserves to know before pressing the button, not
 * after.
 */
export function DeleteAccountSection({ canDelete }: { canDelete: boolean }) {
  const t = useTranslations("profile.deleteAccount");
  const tAuth = useTranslations("auth.fields");
  const tCommon = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    deleteOwnAccount,
    null
  );

  return (
    <section className="mt-10 rounded-3xl border border-brand/25 bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-semibold text-pizza-ink">{t("title")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-pizza-muted">{t("explainer")}</p>
      <p className="mt-2 text-sm leading-relaxed text-pizza-muted">{t("ordersKept")}</p>

      {!canDelete ? (
        <FormAlert tone="info" className="mt-5">
          {t("ownerBlocked")}
        </FormAlert>
      ) : !confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-5 rounded-full border border-brand px-5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand hover:text-white"
        >
          {t("start")}
        </button>
      ) : (
        <form action={formAction} className="mt-5 space-y-4">
          <FormAlert tone="error">{t("warning")}</FormAlert>

          {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

          <PasswordField
            label={tAuth("password")}
            name="password"
            autoComplete="current-password"
            error={state?.fieldErrors?.password}
            hint={t("passwordHint")}
            required
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {isPending ? t("deleting") : t("confirm")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="rounded-full border border-pizza-cream-dark px-6 py-2.5 text-sm font-semibold text-pizza-ink transition hover:border-pizza-ink disabled:opacity-60"
            >
              {tCommon("cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
