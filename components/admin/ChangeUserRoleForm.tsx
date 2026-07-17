"use client";

import { useActionState } from "react";
import { updateUserRole } from "@/app/actions/admin-users";
import { FormAlert } from "@/components/ui/FormAlert";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type ActionResult } from "@/types/auth";
import type { AdminUser } from "@/types/admin";

/**
 * Role picker for a single user. Rendered only for super_admin — the action and
 * the RLS policy both re-check that, so hiding it is UX, not security.
 */
export function ChangeUserRoleForm({
  user,
  onDone,
}: {
  user: AdminUser;
  onDone?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    updateUserRole,
    null
  );

  // super_admin is deliberately not assignable through the UI.
  if (user.role === "super_admin") {
    return (
      <FormAlert tone="info">
        Ролята на главен администратор се променя само ръчно през базата.
      </FormAlert>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}

      <input type="hidden" name="userId" value={user.id} />

      <div>
        <p className="text-sm text-pizza-muted">
          Потребител:{" "}
          <span className="font-semibold text-pizza-ink">{user.fullName}</span>{" "}
          <span className="text-pizza-muted">({user.email})</span>
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-pizza-ink">Роля</legend>
        {ASSIGNABLE_ROLES.map((role) => (
          <label
            key={role}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-pizza-cream-dark p-3 transition hover:border-pizza-green/50"
          >
            <input
              type="radio"
              name="role"
              value={role}
              defaultChecked={user.role === role}
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
        {state?.fieldErrors?.role && (
          <span role="alert" className="block text-xs font-medium text-brand">
            {state.fieldErrors.role}
          </span>
        )}
      </fieldset>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-pizza-green px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
        >
          {isPending ? "Запазване…" : "Промени роля"}
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
