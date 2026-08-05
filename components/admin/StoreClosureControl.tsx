"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closeStoreAction,
  endForcedOpeningAction,
  forceOpenStoreAction,
  openStoreAction,
} from "@/app/actions/store-closure";
import { FormAlert } from "@/components/ui/FormAlert";
import { formatSofiaTime, sofiaDayOffset } from "@/lib/store-hours";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types/auth";
import {
  CLOSURE_MAX_MINUTES,
  CLOSURE_MIN_MINUTES,
  CLOSURE_PRESET_MINUTES,
  FORCE_OPEN_PRESET_MINUTES,
  type StoreStatus,
} from "@/types/store-status";

/**
 * The staff switch for "is the site taking orders right now" — in both
 * directions.
 *
 * Bulgarian-only, like the rest of the admin panel. It sits at the bottom of
 * the nav on purpose: it is reached from every admin screen, but it is not a
 * destination, and it should not be the thing a thumb lands on by accident on
 * the kitchen tablet.
 *
 * Which button is offered depends entirely on why the shop is open or closed,
 * so there is never more than one meaningful action on screen:
 *   - open                → "Затвори заведението"
 *   - closed by staff     → "Отвори заведението" (undo the closure)
 *   - closed by the hours → "Отвори принудително" (override the schedule)
 *   - forced open         → "Върни работното време" (stop overriding)
 *
 * Both overrides have the same two modes, and the difference is the whole
 * point: a timed one lapses BY ITSELF when the minutes run out, while the
 * "до ръчно…" one waits for a human.
 */

/** "днес в 21:30" / "утре в 11:00" / "на 12.08 в 11:00". */
function whenPhrase(reopensAt: string, serverTime: string): string {
  const at = new Date(reopensAt);
  const time = formatSofiaTime(at);
  const offset = sofiaDayOffset(new Date(serverTime), at);

  if (offset <= 0) return `днес в ${time}`;
  if (offset === 1) return `утре в ${time}`;

  const date = new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "2-digit",
  }).format(at);
  return `на ${date} в ${time}`;
}

/** One line of plain Bulgarian describing the current state. */
function statusLine(status: StoreStatus): string {
  if (status.forcedOpen) {
    return status.forcedOpenUntil
      ? `Отворено принудително — до ${whenPhrase(status.forcedOpenUntil, status.serverTime)}.`
      : "Отворено принудително — до ръчно затваряне.";
  }

  if (status.isOpen) return "Заведението приема поръчки.";

  switch (status.reason) {
    case "manual_indefinite":
      return "Затворено до ръчно отваряне.";
    case "manual_timed":
      return status.reopensAt
        ? `Затворено — отваря се автоматично ${whenPhrase(status.reopensAt, status.serverTime)}.`
        : "Затворено.";
    case "hours":
      return status.reopensAt
        ? `Извън работно време — отваря ${whenPhrase(status.reopensAt, status.serverTime)}.`
        : "Извън работно време.";
    default:
      return "Затворено.";
  }
}

export function StoreClosureControl({
  status,
  variant = "sidebar",
}: {
  status: StoreStatus;
  /** `sidebar` is the desktop column, `bar` the phone/tablet top strip. */
  variant?: "sidebar" | "bar";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"close" | "forceOpen" | null>(null);
  const [pending, startPending] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // A manual closure is the only thing the "Отвори заведението" button can
  // undo. Being shut simply because it is 3 a.m. is a different case with a
  // different button — the hours have to be overridden, not cleared.
  const manuallyClosed =
    status.reason === "manual_timed" || status.reason === "manual_indefinite";
  const closedByHours = !status.isOpen && status.reason === "hours";

  /** Runs one of the no-argument actions and re-renders the panel behind it. */
  function run(action: () => Promise<ActionResult>, fallback: string) {
    setActionError(null);
    startPending(async () => {
      const result = await action();
      if (!result.ok) {
        setActionError(result.error ?? fallback);
        return;
      }
      router.refresh();
    });
  }

  const buttonShape =
    variant === "bar"
      ? "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm"
      : "w-full rounded-xl px-3.5 py-2.5 text-sm";

  const wrapper =
    variant === "bar"
      ? "flex shrink-0 items-center gap-2"
      : "border-t border-pizza-cream-dark p-3";

  return (
    <div className={wrapper}>
      {variant === "sidebar" && (
        <p
          className={cn(
            "mb-2 px-1 text-xs leading-snug",
            status.forcedOpen
              ? "font-semibold text-amber-700"
              : status.isOpen
                ? "text-pizza-muted"
                : "font-semibold text-brand-dark"
          )}
        >
          {statusLine(status)}
        </p>
      )}

      {status.forcedOpen ? (
        // Nothing else is offered here on purpose: the override has to be
        // lifted before the normal open/closed choices mean anything again.
        <button
          type="button"
          onClick={() => run(endForcedOpeningAction, "Неуспешно спиране.")}
          disabled={pending}
          className={cn(
            "border border-amber-400 bg-white font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60",
            buttonShape
          )}
        >
          {pending ? "Спира се…" : "🕒 Върни работното време"}
        </button>
      ) : manuallyClosed ? (
        <button
          type="button"
          onClick={() => run(openStoreAction, "Неуспешно отваряне.")}
          disabled={pending}
          className={cn(
            "bg-pizza-green font-semibold text-white shadow-sm transition hover:bg-pizza-green-dark disabled:opacity-60",
            buttonShape
          )}
        >
          {pending ? "Отваря се…" : "▶ Отвори заведението"}
        </button>
      ) : closedByHours ? (
        <button
          type="button"
          onClick={() => setDialog("forceOpen")}
          className={cn(
            "border border-pizza-green/50 bg-white font-semibold text-pizza-green-dark transition hover:bg-pizza-green/10",
            buttonShape
          )}
        >
          ⚡ Отвори принудително
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setDialog("close")}
          className={cn(
            "border border-brand/40 bg-white font-semibold text-brand transition hover:bg-pizza-red-light",
            buttonShape
          )}
        >
          🔒 Затвори заведението
        </button>
      )}

      {/* On the phone strip the state is a badge next to the button — there is
          no room for a sentence. */}
      {variant === "bar" && status.forcedOpen && (
        <span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
          Принудително
        </span>
      )}
      {variant === "bar" && !status.isOpen && (
        <span className="whitespace-nowrap rounded-full bg-pizza-red-light px-2.5 py-1 text-xs font-semibold text-brand-dark">
          Затворено
        </span>
      )}

      {actionError && (
        <FormAlert tone="error" className="mt-2">
          {actionError}
        </FormAlert>
      )}

      {dialog === "close" && <CloseStoreDialog onClose={() => setDialog(null)} />}
      {dialog === "forceOpen" && (
        <ForceOpenDialog status={status} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

/**
 * The overlay both dialogs sit in: Escape to leave, focus moved inside so a
 * keyboard user is not left stranded behind it, and a click on the backdrop
 * (and only the backdrop) dismisses.
 */
function DialogShell({
  titleId,
  title,
  intro,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  intro: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl focus:outline-none"
      >
        <h2 id={titleId} className="font-display text-xl font-bold text-pizza-ink">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-pizza-muted">{intro}</p>
        {children}
      </div>
    </div>
  );
}

/** The modal: pick a duration, or close until someone reopens by hand. */
function CloseStoreDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    closeStoreAction,
    null
  );
  const [customMinutes, setCustomMinutes] = useState("");

  // The dialog's job is done the moment the closure is stored; the panel
  // behind it re-renders with the new state.
  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <DialogShell
      titleId={titleId}
      title="Затвори заведението"
      intro="Докато е затворено, клиентите виждат съобщение и не могат да правят поръчки."
      onClose={onClose}
    >
      <>
        {state?.error && (
          <FormAlert tone="error" className="mt-4">
            {state.error}
          </FormAlert>
        )}

        <form action={formAction} className="mt-5 space-y-5" noValidate>
          <div>
            <p className="mb-2 text-sm font-semibold text-pizza-ink">
              Затвори за определено време
            </p>
            <p className="mb-3 text-xs text-pizza-muted">
              След изтичане заведението се отваря само и поръчките тръгват отново.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CLOSURE_PRESET_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="submit"
                  name="minutes"
                  value={minutes}
                  disabled={isPending}
                  className="rounded-2xl border border-pizza-cream-dark bg-white px-4 py-3 text-sm font-semibold text-pizza-ink transition hover:border-brand hover:text-brand disabled:opacity-60"
                >
                  {minutes < 60 ? `${minutes} минути` : `${minutes / 60} час${minutes / 60 === 1 ? "" : "а"}`}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-end gap-2">
              <label className="flex-1 text-sm">
                <span className="mb-1 block font-medium text-pizza-ink">Друго (минути)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={CLOSURE_MIN_MINUTES}
                  max={CLOSURE_MAX_MINUTES}
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  // Enter here would otherwise fire the first submit button in
                  // the form — closing for 30 minutes instead of the typed value.
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder={`${CLOSURE_MIN_MINUTES}–${CLOSURE_MAX_MINUTES}`}
                  className="w-full rounded-xl border border-pizza-cream-dark px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                />
              </label>
              <button
                type="submit"
                name="minutes"
                value={customMinutes}
                disabled={isPending || customMinutes.trim() === ""}
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                Затвори
              </button>
            </div>
            {state?.fieldErrors?.minutes && (
              <p className="mt-1.5 text-xs font-medium text-brand-dark">
                {state.fieldErrors.minutes}
              </p>
            )}
          </div>

          <div className="border-t border-pizza-cream-dark pt-5">
            <p className="mb-2 text-sm font-semibold text-pizza-ink">
              Затвори до ръчно отваряне
            </p>
            <p className="mb-3 text-xs text-pizza-muted">
              За остатъка от вечерта или за няколко дни. Заведението остава затворено,
              докато някой не натисне „Отвори заведението“.
            </p>
            {/* The only control that sends a `mode`; everything above sends
                `minutes`, which the action reads as the timed branch. */}
            <button
              type="submit"
              name="mode"
              value="indefinite"
              disabled={isPending}
              className="w-full rounded-2xl bg-pizza-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
            >
              Затвори до ръчно отваряне
            </button>
          </div>
        </form>

        <CancelButton onClose={onClose} />
      </>
    </DialogShell>
  );
}

/** The shared "Отказ" at the bottom of both dialogs. */
function CancelButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="mt-5 w-full rounded-full border border-pizza-cream-dark px-4 py-2.5 text-sm font-medium text-pizza-muted transition hover:text-pizza-ink"
    >
      Отказ
    </button>
  );
}

/**
 * The mirror modal: take orders even though the schedule says the kitchen is
 * closed. Same two modes as closing, same form mechanics — a `minutes` value
 * means timed, `mode=indefinite` means "until someone stops it".
 */
function ForceOpenDialog({
  status,
  onClose,
}: {
  status: StoreStatus;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    forceOpenStoreAction,
    null
  );
  const [customMinutes, setCustomMinutes] = useState("");

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <DialogShell
      titleId={titleId}
      title="Отвори принудително"
      intro="Сайтът ще приема поръчки въпреки работното време. Клиентите няма да виждат съобщение за затворено."
      onClose={onClose}
    >
      <>
        {/* The schedule the override is fighting, so nobody forces the shop
            open five minutes before it would open anyway. */}
        {status.reopensAt && (
          <p className="mt-3 rounded-2xl bg-pizza-cream px-4 py-2.5 text-xs text-pizza-ink">
            По работно време заведението отваря{" "}
            <strong>{whenPhrase(status.reopensAt, status.serverTime)}</strong>.
          </p>
        )}

        {state?.error && (
          <FormAlert tone="error" className="mt-4">
            {state.error}
          </FormAlert>
        )}

        <form action={formAction} className="mt-5 space-y-5" noValidate>
          <div>
            <p className="mb-2 text-sm font-semibold text-pizza-ink">
              Отвори за определено време
            </p>
            <p className="mb-3 text-xs text-pizza-muted">
              След изтичане заведението се връща към обявеното работно време — не е
              нужно да правите нищо.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FORCE_OPEN_PRESET_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="submit"
                  name="minutes"
                  value={minutes}
                  disabled={isPending}
                  className="rounded-2xl border border-pizza-cream-dark bg-white px-4 py-3 text-sm font-semibold text-pizza-ink transition hover:border-pizza-green hover:text-pizza-green-dark disabled:opacity-60"
                >
                  {minutes < 60
                    ? `${minutes} минути`
                    : `${minutes / 60} час${minutes / 60 === 1 ? "" : "а"}`}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-end gap-2">
              <label className="flex-1 text-sm">
                <span className="mb-1 block font-medium text-pizza-ink">Друго (минути)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={CLOSURE_MIN_MINUTES}
                  max={CLOSURE_MAX_MINUTES}
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  // Enter would otherwise fire the first submit button in the
                  // form — one hour instead of the typed value.
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder={`${CLOSURE_MIN_MINUTES}–${CLOSURE_MAX_MINUTES}`}
                  className="w-full rounded-xl border border-pizza-cream-dark px-3 py-2.5 text-sm focus:border-pizza-green focus:outline-none"
                />
              </label>
              <button
                type="submit"
                name="minutes"
                value={customMinutes}
                disabled={isPending || customMinutes.trim() === ""}
                className="rounded-xl bg-pizza-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pizza-green-dark disabled:opacity-50"
              >
                Отвори
              </button>
            </div>
            {state?.fieldErrors?.minutes && (
              <p className="mt-1.5 text-xs font-medium text-brand-dark">
                {state.fieldErrors.minutes}
              </p>
            )}
          </div>

          <div className="border-t border-pizza-cream-dark pt-5">
            <p className="mb-2 text-sm font-semibold text-pizza-ink">
              Отвори до ръчно затваряне
            </p>
            <p className="mb-3 text-xs text-pizza-muted">
              Сайтът приема поръчки, докато някой не натисне „Върни работното време“.
              Работното време спира да важи — включително края на утрешния ден.
            </p>
            <button
              type="submit"
              name="mode"
              value="indefinite"
              disabled={isPending}
              className="w-full rounded-2xl bg-pizza-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
            >
              Отвори до ръчно затваряне
            </button>
          </div>
        </form>

        <CancelButton onClose={onClose} />
      </>
    </DialogShell>
  );
}
