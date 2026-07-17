"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { createAddress, deleteAddress, updateAddress } from "@/app/actions/auth";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FormAlert } from "@/components/ui/FormAlert";
import type { ActionResult, UserAddress } from "@/types/auth";

/** One saved address, formatted on a single line. */
function formatAddress(a: UserAddress): string {
  const parts = [a.addressLine];
  if (a.entrance) parts.push(`вх. ${a.entrance}`);
  if (a.floor) parts.push(`ет. ${a.floor}`);
  if (a.apartment) parts.push(`ап. ${a.apartment}`);
  return [a.city, parts.join(", ")].filter(Boolean).join(", ");
}

function AddressForm({
  address,
  onDone,
}: {
  /** Present when editing; absent when creating. */
  address?: UserAddress;
  onDone: () => void;
}) {
  const isEdit = Boolean(address);
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    isEdit ? updateAddress : createAddress,
    null
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}

      {isEdit && <input type="hidden" name="id" value={address!.id} />}

      <Input
        label="Етикет"
        name="label"
        defaultValue={address?.label ?? ""}
        placeholder="Основен адрес"
        hint="Например: Вкъщи, Офис."
        error={fieldErrors.label}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Име и фамилия"
          name="fullName"
          defaultValue={address?.fullName ?? ""}
          autoComplete="name"
          error={fieldErrors.fullName}
        />
        <Input
          label="Телефон"
          name="phone"
          type="tel"
          defaultValue={address?.phone ?? ""}
          autoComplete="tel"
          placeholder="0888123456"
          error={fieldErrors.phone}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Град"
          name="city"
          defaultValue={address?.city ?? "Варна"}
          error={fieldErrors.city}
        />
        <Input
          label="Адрес"
          name="addressLine"
          defaultValue={address?.addressLine ?? ""}
          placeholder="ул. Пример 12"
          className="sm:col-span-2"
          error={fieldErrors.addressLine}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Вход" name="entrance" defaultValue={address?.entrance ?? ""} error={fieldErrors.entrance} />
        <Input label="Етаж" name="floor" defaultValue={address?.floor ?? ""} error={fieldErrors.floor} />
        <Input label="Апартамент" name="apartment" defaultValue={address?.apartment ?? ""} error={fieldErrors.apartment} />
      </div>

      <Textarea
        label="Бележка за доставката"
        name="deliveryNote"
        defaultValue={address?.deliveryNote ?? ""}
        placeholder="Например: звънецът не работи, обадете се."
        error={fieldErrors.deliveryNote}
      />

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-pizza-muted">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="h-4 w-4 rounded border-pizza-cream-dark text-pizza-green focus:ring-2 focus:ring-pizza-green/25"
        />
        Използвай като адрес по подразбиране
      </label>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-pizza-green px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
        >
          {isPending ? "Запазване…" : isEdit ? "Запази промените" : "Добави адрес"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-pizza-cream-dark px-6 py-2.5 text-sm font-semibold text-pizza-muted transition hover:text-pizza-ink"
        >
          Отказ
        </button>
      </div>
    </form>
  );
}

function AddressCard({
  address,
  onEdit,
}: {
  address: UserAddress;
  onEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAddress(address.id);
      if (!result.ok) setError(result.error ?? "Адресът не можа да бъде изтрит.");
      setConfirming(false);
    });
  }

  return (
    <div className="rounded-2xl border border-pizza-cream-dark bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-pizza-ink">
              {address.label || "Адрес"}
            </span>
            {address.isDefault && (
              <span className="rounded-full bg-pizza-green-light px-2.5 py-0.5 text-[11px] font-semibold text-pizza-green-dark">
                По подразбиране
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-pizza-muted">{formatAddress(address)}</p>
          {address.phone && (
            <p className="mt-1 text-sm text-pizza-muted">📞 {address.phone}</p>
          )}
          {address.deliveryNote && (
            <p className="mt-1 text-xs italic text-pizza-muted/80">
              {address.deliveryNote}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-pizza-cream-dark px-3.5 py-1.5 text-xs font-semibold text-pizza-ink transition hover:border-pizza-green hover:text-pizza-green"
          >
            Редактирай
          </button>
          <button
            type="button"
            onClick={() => (confirming ? handleDelete() : setConfirming(true))}
            disabled={isPending}
            className="rounded-full border border-pizza-cream-dark px-3.5 py-1.5 text-xs font-semibold text-pizza-muted transition hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {isPending ? "…" : confirming ? "Сигурни ли сте?" : "Изтрий"}
          </button>
        </div>
      </div>

      {error && (
        <FormAlert tone="error" className="mt-4">
          {error}
        </FormAlert>
      )}
    </div>
  );
}

/** Saved delivery addresses: list, add, edit, delete. */
export function AddressSection({ addresses }: { addresses: UserAddress[] }) {
  // null = closed, "new" = creating, otherwise the id being edited.
  const [mode, setMode] = useState<string | null>(null);

  const editing = addresses.find((a) => a.id === mode);

  return (
    <section className="rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-pizza-ink">
          Адреси за доставка
        </h2>
        {mode === null && (
          <button
            type="button"
            onClick={() => setMode("new")}
            className="shrink-0 rounded-full bg-pizza-green px-4 py-2 text-sm font-semibold text-white transition hover:bg-pizza-green-dark"
          >
            Добави адрес
          </button>
        )}
      </div>

      <div className="mt-5">
        {mode === "new" || editing ? (
          <AddressForm address={editing} onDone={() => setMode(null)} />
        ) : addresses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-pizza-cream-dark bg-pizza-cream/50 px-6 py-8 text-center">
            <p className="text-2xl" aria-hidden>
              📍
            </p>
            <p className="mt-2 font-medium text-pizza-ink">
              Добавете адрес за по-бърза поръчка.
            </p>
            <p className="mt-1 text-sm text-pizza-muted">
              Ще го попълваме автоматично при всяка следваща поръчка.
            </p>
            <button
              type="button"
              onClick={() => setMode("new")}
              className="mt-5 rounded-full bg-pizza-green px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark"
            >
              Добави адрес
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((a) => (
              <AddressCard key={a.id} address={a} onEdit={() => setMode(a.id)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
