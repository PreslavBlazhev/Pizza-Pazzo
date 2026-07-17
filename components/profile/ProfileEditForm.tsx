"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { updateProfile } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { FormAlert } from "@/components/ui/FormAlert";
import type { ActionResult } from "@/types/auth";

/**
 * Read-only profile details that swap to an edit form in place.
 * The email is shown but not editable — changing it would need a re-verification
 * flow, which is out of scope for this stage.
 */
export function ProfileEditForm({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string | null;
  email: string;
}) {
  const t = useTranslations("profile");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
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
            {t("personalData")}
          </h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full border border-pizza-cream-dark px-4 py-2 text-sm font-semibold text-pizza-ink transition hover:border-pizza-green hover:text-pizza-green"
          >
            {t("editProfile")}
          </button>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-pizza-muted">
              {t("name")}
            </dt>
            <dd className="mt-1 font-medium text-pizza-ink">
              {fullName || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-pizza-muted">
              {t("email")}
            </dt>
            <dd className="mt-1 break-all font-medium text-pizza-ink">{email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-pizza-muted">
              {t("phone")}
            </dt>
            <dd className="mt-1 font-medium text-pizza-ink">{phone || "—"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-semibold text-pizza-ink">
        {t("editTitle")}
      </h2>

      <form action={formAction} className="mt-5 space-y-4" noValidate>
        {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

        <Input
          label={tAuth("fields.fullName")}
          name="fullName"
          defaultValue={fullName ?? ""}
          autoComplete="name"
          error={fieldErrors.fullName}
        />

        <Input
          label={tAuth("fields.phone")}
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          autoComplete="tel"
          error={fieldErrors.phone}
        />

        {/* defaultValue, not value: a controlled input with no onChange warns. */}
        <Input
          label={tAuth("fields.email")}
          name="email"
          defaultValue={email}
          disabled
          hint={t("emailImmutable")}
        />

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-pizza-green px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
          >
            {isPending ? t("saving") : tCommon("save")}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-pizza-cream-dark px-6 py-2.5 text-sm font-semibold text-pizza-muted transition hover:text-pizza-ink"
          >
            {tCommon("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
