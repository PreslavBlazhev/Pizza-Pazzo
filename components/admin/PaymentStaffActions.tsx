"use client";

import { useActionState, useState } from "react";
import {
  acknowledgePaymentAlertAction,
  recordBankRefundAction,
  releaseHeldPaidOrderAction,
} from "@/app/actions/admin-payments";
import { FormAlert } from "@/components/ui/FormAlert";
import { formatMinor } from "@/lib/payments/money";
import type { AdminPaymentAttempt, AdminPaymentEvent, AdminRefundRecord } from "@/lib/payments/admin";
import type { ActionResult } from "@/types/auth";

const BUTTON =
  "rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60";

function ActionForm({
  action,
  orderId,
  label,
  pendingLabel,
  strong,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  orderId: string;
  label: string;
  pendingLabel: string;
  strong?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      <button
        type="submit"
        disabled={isPending || !!state?.ok}
        className={strong ? "rounded-full bg-green-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60" : BUTTON}
      >
        {isPending ? pendingLabel : label}
      </button>
    </form>
  );
}

const EVENT_LABELS: Record<string, string> = {
  RELEASE_HELD_PAID_ORDER: "Пусната ръчно към кухнята",
  ACK_PAYMENT_ALERT: "Сигналът е прегледан",
  REFUND_RECORDED: "Отразено възстановяване от банковия портал",
};

export function PaymentStaffActions({
  orderId,
  heldPaid,
  alertOpen,
  attempts,
  refunds,
  events,
  canRecordRefunds,
}: {
  orderId: string;
  /** PAID, not released, not cancelled: waiting for a person. */
  heldPaid: boolean;
  /** An alert nobody acknowledged yet. */
  alertOpen: boolean;
  attempts: AdminPaymentAttempt[];
  refunds: AdminRefundRecord[];
  events: AdminPaymentEvent[];
  canRecordRefunds: boolean;
}) {
  const paid = attempts.filter((a) => a.status === "PAID");
  return (
    <div className="space-y-4">
      {heldPaid && (
        <div className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">
            Платена, но задържана: банката потвърди плащането със закъснение. Обадете се на
            клиента. Ако поръчката още е желана — пуснете я към кухнята. Ако не — откажете я и
            възстановете сумата през банковия портал.
          </p>
          <ActionForm
            action={releaseHeldPaidOrderAction}
            orderId={orderId}
            label="Пусни към кухнята"
            pendingLabel="Пуска се…"
            strong
          />
        </div>
      )}
      {alertOpen && !heldPaid && (
        <ActionForm
          action={acknowledgePaymentAlertAction}
          orderId={orderId}
          label="Отбележи сигнала като прегледан"
          pendingLabel="Записва се…"
        />
      )}

      {refunds.length > 0 && (
        <div className="text-sm">
          <h3 className="font-semibold text-neutral-700">Възстановявания (направени през банковия портал)</h3>
          <ul className="mt-1 space-y-1 text-neutral-700">
            {refunds.map((r) => (
              <li key={r.id}>
                {formatMinor(r.amountMinor, r.currency)} · {r.kind === "REVERSAL" ? "пълна отмяна" : "възстановяване"} ·
                реф. <span className="font-mono">{r.bankReference}</span> · {r.recordedByEmail ?? "—"} ·{" "}
                {new Date(r.createdAt).toLocaleString("bg-BG")}
                {r.note ? <span className="block text-neutral-500">{r.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canRecordRefunds && paid.length > 0 && <RefundForm orderId={orderId} paid={paid} refunds={refunds} />}

      {events.length > 0 && (
        <div className="text-xs text-neutral-500">
          <h3 className="font-semibold">Журнал на действията по плащането</h3>
          <ul className="mt-1 space-y-0.5">
            {events.map((e) => (
              <li key={e.id}>
                {new Date(e.createdAt).toLocaleString("bg-BG")} · {EVENT_LABELS[e.action] ?? e.action} ·{" "}
                {e.actorEmail ?? "—"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RefundForm({
  orderId,
  paid,
  refunds,
}: {
  orderId: string;
  paid: AdminPaymentAttempt[];
  refunds: AdminRefundRecord[];
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(recordBankRefundAction, null);
  // One key per rendered form: a double submit is recorded once.
  const [key] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
        Отрази възстановяване, направено в банковия портал
      </button>
    );
  }
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-neutral-200 p-3 text-sm">
      <p className="text-neutral-600">
        Сайтът не връща пари. Първо направете възстановяването в административния панел на
        банката (сумата се връща по картата, с която е платено), после го запишете тук с
        референцията от банката.
      </p>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <label className="block">
        Плащане
        <select name="attemptId" className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1">
          {paid.map((a) => {
            const done = refunds.filter((r) => r.attemptId === a.id).reduce((s, r) => s + r.amountMinor, 0);
            return (
              <option key={a.id} value={a.id}>
                {a.reference} — платено {formatMinor(a.amountMinor, a.currency)}, остава{" "}
                {formatMinor(a.amountMinor - done, a.currency)}
              </option>
            );
          })}
        </select>
      </label>
      <label className="block">
        Вид
        <select name="kind" className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1">
          <option value="REFUND">Възстановяване (частично или пълно)</option>
          <option value="REVERSAL">Пълна отмяна (reversal)</option>
        </select>
      </label>
      <label className="block">
        Сума, € <input name="amountEur" inputMode="decimal" required className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1" />
      </label>
      <label className="block">
        Референция от банковия портал{" "}
        <input name="bankReference" required maxLength={64} className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1" />
      </label>
      <label className="block">
        Бележка (по избор) <input name="note" maxLength={500} className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1" />
      </label>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      <button type="submit" disabled={isPending || !!state?.ok} className={BUTTON}>
        {isPending ? "Записва се…" : "Запиши възстановяването"}
      </button>
    </form>
  );
}
