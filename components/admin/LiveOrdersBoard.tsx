"use client";

import { useState, useTransition } from "react";
import { openStoreAction } from "@/app/actions/store-closure";
import { formatEurPrice } from "@/lib/format-price";
import { extraKitchenLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import { formatSofiaTime, sofiaDayOffset } from "@/lib/store-hours";
import { PrintOrderButtons } from "./PrintOrderButton";
import { closureEndsShift, useShift } from "./ShiftProvider";
import type { Order } from "@/types/order";
import type { StoreStatus } from "@/types/store-status";

const QUICK_TIMES = [20, 30, 45, 60];

/**
 * The tablet screen: the pending orders, big enough to read across a kitchen,
 * with one tap to accept and one to refuse.
 *
 * It owns none of the shift any more. Polling, the siren, the wake lock and
 * the "am I on shift" flag live in `ShiftProvider`, mounted by the admin
 * layout, because the owner wants the alarm to ring on EVERY admin screen —
 * Табло, Продукти, anywhere — not only while this page happens to be open.
 * What is left here is presentation plus the two shift buttons, which belong
 * on the screen the staff start their day from.
 */
export function LiveOrdersBoard() {
  const {
    hydrated,
    shiftStarted,
    audioBlocked,
    orders,
    acceptedOrders,
    printTemplates,
    storeStatus,
    connectionLost,
    lastCheck,
    busyOrderId,
    startShift,
    endShift,
    unlockSound,
    refresh,
    submitStatus,
  } = useShift();

  // The only state that is genuinely this screen's: the second tap on
  // "Приключи смяна".
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const hasPending = orders.length > 0;
  const closingDown = closureEndsShift(storeStatus);
  // Closed for good, but orders are still on screen: the shift has to outlive
  // the closing time until the last one is dealt with.
  const closingAfterLastOrder = shiftStarted && closingDown && hasPending;

  const finishShift = () => {
    setConfirmingEnd(false);
    endShift();
  };

  // Nothing until we know whether a shift is already running: rendering the
  // start screen first would flash it at staff who never left the shift.
  if (!hydrated) {
    return <div className="min-h-[60vh]" aria-hidden />;
  }

  return (
    <div className={shiftStarted && hasPending ? "animate-pulse-bg" : undefined}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {shiftStarted
            ? "Смяната е започната · алармата звъни във всички менюта"
            : "Смяната не е започната"}
          {lastCheck && ` · последна проверка: ${lastCheck.toLocaleTimeString("bg-BG")}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {connectionLost && (
            <p className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white">
              ⚠ Няма връзка със сървъра — проверете интернета!
            </p>
          )}
          {shiftStarted && (
            <EndShiftButton
              confirming={confirmingEnd}
              pendingCount={orders.length}
              onAsk={() => setConfirmingEnd(true)}
              onCancel={() => setConfirmingEnd(false)}
              onConfirm={finishShift}
            />
          )}
        </div>
      </div>

      {shiftStarted && audioBlocked && (
        <button
          type="button"
          onClick={unlockSound}
          className="mb-4 w-full rounded-2xl border-2 border-red-500 bg-red-50 px-5 py-4 text-left"
        >
          <span className="block text-lg font-bold text-red-700">
            🔇 Звукът е спрян от браузъра
          </span>
          <span className="mt-1 block text-red-800">
            Смяната продължава, но таблетът няма да звъни. Натиснете тук (или
            където и да е по екрана), за да включите звука отново.
          </span>
        </button>
      )}

      <StoreClosedNotice status={storeStatus} onReopened={refresh} />

      {closingAfterLastOrder && (
        <p className="mb-4 rounded-2xl border-2 border-amber-400 bg-white px-5 py-3 font-semibold text-amber-900">
          Смяната приключва автоматично, щом последната чакаща поръчка бъде
          приета или отказана.
        </p>
      )}

      {!shiftStarted && (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
          <p className="max-w-md text-neutral-600">
            Натиснете бутона в началото на работния ден. Екранът ще остане буден и
            при нова поръчка таблетът ще звъни, докато поръчката не бъде приета
            или отказана.
          </p>
          <button
            onClick={startShift}
            disabled={closingDown}
            className="rounded-full bg-pizza-green px-10 py-5 text-2xl font-bold text-white shadow-lg transition hover:bg-pizza-green-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            ▶ Начало на смяната
          </button>
          {closingDown ? (
            <p className="max-w-md text-sm font-semibold text-amber-800">
              Заведението е затворено — смяната може да започне, когато то е
              отворено.
            </p>
          ) : (
            <p className="max-w-md text-sm text-neutral-400">
              Звукът работи само след натискане на бутона — изискване на браузъра.
              След това смяната остава активна, докато не натиснете „Приключи
              смяна“ или заведението не бъде затворено.
            </p>
          )}
        </div>
      )}

      {shiftStarted && !hasPending && (
        <div className="flex min-h-[50vh] items-center justify-center rounded-3xl border-2 border-dashed border-pizza-green/40 bg-pizza-green/5">
          <p className="text-2xl font-semibold text-pizza-green-dark">
            ✓ Няма чакащи поръчки
          </p>
        </div>
      )}

      {shiftStarted && (
        <div className="space-y-6">
          {orders.map((order) => (
            <LiveOrderCard
              key={order.id}
              order={order}
              busy={busyOrderId === order.id}
              onSubmit={submitStatus}
            />
          ))}
        </div>
      )}

      {shiftStarted && acceptedOrders.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-neutral-700">
            Приети наскоро — печат на бележка
          </h2>
          <div className="space-y-3">
            {acceptedOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col gap-3 rounded-2xl border-2 border-pizza-green/40 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-lg font-extrabold text-pizza-ink">
                    ✓ Поръчка #{order.orderNumber}
                    {order.estimatedTimeMinutes && (
                      <span className="ml-2 text-sm font-semibold text-pizza-green-dark">
                        {order.estimatedTimeMinutes} мин
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {order.customerName} · {order.deliveryAddress}
                  </p>
                </div>
                <PrintOrderButtons order={order} templates={printTemplates} compact />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Приключи смяна" — the one manual way out.
 *
 * It asks twice on purpose: this is the button that silences the alarm on a
 * tablet standing in a kitchen, so a sleeve brushing past it must not be
 * enough. The second step also says how many orders are still waiting, because
 * ending the shift takes them off this screen.
 */
function EndShiftButton({
  confirming,
  pendingCount,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  pendingCount: number;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onAsk}
        className="rounded-full border-2 border-neutral-300 bg-white px-5 py-2 text-sm font-bold text-neutral-700 transition hover:border-red-400 hover:text-red-600"
      >
        ■ Приключи смяна
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-red-400 bg-white px-3 py-2">
      <span className="text-sm font-semibold text-neutral-700">
        {pendingCount > 0
          ? `Има ${pendingCount} чакащи поръчки. Да приключим ли смяната?`
          : "Да приключим ли смяната?"}
      </span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white transition hover:bg-red-700"
      >
        Да, приключи
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 transition hover:text-neutral-900"
      >
        Не
      </button>
    </div>
  );
}

function LiveOrderCard({
  order,
  busy,
  onSubmit,
}: {
  order: Order;
  busy: boolean;
  onSubmit: (orderId: string, fields: Record<string, string>) => Promise<void>;
}) {
  const [quickTime, setQuickTime] = useState(30);
  const [customTime, setCustomTime] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const resolvedTime = customTime.trim() === "" ? String(quickTime) : customTime.trim();

  return (
    <div className="rounded-2xl border-4 border-red-500 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-extrabold text-pizza-ink sm:text-3xl">
          Поръчка #{order.orderNumber}
        </h2>
        <p className="text-base text-neutral-500 sm:text-lg">
          {new Date(order.createdAt).toLocaleTimeString("bg-BG", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          ч.
        </p>
      </div>

      <div className="mt-3 grid gap-4 text-base sm:grid-cols-2 sm:text-lg">
        <div>
          <p className="font-semibold">{order.customerName}</p>
          <a href={`tel:${order.customerPhone}`} className="text-pizza-green-dark underline">
            {order.customerPhone}
          </a>
          <p className="mt-1 text-neutral-600">
            {order.deliveryAddress}, {order.deliveryCity}
          </p>
          {order.deliveryNote && (
            <p className="mt-1 text-neutral-500">Бележка: {order.deliveryNote}</p>
          )}
        </div>
        <div>
          <ul className="space-y-1.5">
            {(order.items ?? []).map((i) => {
              // Kitchen-facing: extras are listed under the dish and marked
              // "/ всяка" when the line has more than one unit.
              const extras = toOrderExtrasDisplay(i.extras, "bg");
              return (
                <li key={i.id}>
                  <div className="flex justify-between gap-3">
                    <span>
                      <strong>{i.quantity}×</strong> {i.productNameBg}
                      {i.variantName ? ` (${i.variantName})` : ""}
                    </span>
                    <span className="whitespace-nowrap text-neutral-600">
                      {formatEurPrice(i.totalPriceEur)}
                    </span>
                  </div>
                  {extras.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 pl-4 font-semibold text-pizza-green-dark">
                      {extras.map((e, n) => (
                        <li key={`${i.id}-x${n}`} className="break-words">
                          + {extraKitchenLabel(e, i.quantity)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 border-t pt-2 text-xl font-bold">
            Общо: {formatEurPrice(order.totalEur)}
            <span className="ml-2 text-sm font-normal text-neutral-500">наложен платеж</span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-3">
        {QUICK_TIMES.map((t) => {
          const selected = customTime.trim() === "" && quickTime === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setQuickTime(t);
                setCustomTime("");
              }}
              className={`rounded-full border-2 px-4 py-2.5 text-base font-bold transition sm:px-5 sm:py-3 sm:text-lg ${
                selected
                  ? "border-pizza-green bg-pizza-green text-white"
                  : "border-neutral-300 bg-white text-neutral-700"
              }`}
            >
              {t} мин
            </button>
          );
        })}
        <input
          type="number"
          min={1}
          max={480}
          value={customTime}
          onChange={(e) => setCustomTime(e.target.value)}
          placeholder="друго"
          className="w-20 rounded-xl border-2 border-neutral-300 px-3 py-2.5 text-base focus:border-pizza-green focus:outline-none sm:w-24 sm:py-3 sm:text-lg"
        />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void onSubmit(order.id, {
            status: "ACCEPTED",
            estimatedTimeMinutes: resolvedTime,
          })
        }
        className="mt-4 w-full rounded-2xl bg-pizza-green px-8 py-5 text-xl font-extrabold text-white shadow-md transition hover:bg-pizza-green-dark disabled:opacity-60 sm:w-auto sm:py-4"
      >
        {busy ? "…" : `✓ ПРИЕМИ (${resolvedTime || "?"} мин)`}
      </button>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="text"
          value={cancelReason}
          maxLength={500}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Причина за отказ (по избор)"
          className="w-full rounded-xl border-2 border-neutral-300 px-3 py-2.5 text-base focus:border-red-400 focus:outline-none sm:flex-1"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onSubmit(order.id, { status: "CANCELLED", adminNote: cancelReason })
          }
          className="rounded-2xl border-2 border-red-400 bg-white px-6 py-3 text-lg font-bold text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-60 sm:py-4"
        >
          ✕ Откажи
        </button>
      </div>
    </div>
  );
}

/**
 * The board's own view of the shop being closed.
 *
 * It shows what will happen next, because that is the difference the staff
 * care about: a timed pause clears itself and the board resumes on the next
 * poll, while "до ръчно отваряне" waits for the button below — this is the
 * "започни смяната на ръка" case.
 *
 * Closing is deliberately NOT offered here; that switch lives in one place,
 * at the bottom of the admin navigation.
 */
function StoreClosedNotice({
  status,
  onReopened,
}: {
  status: StoreStatus | null;
  onReopened: () => void | Promise<void>;
}) {
  const [reopening, startReopen] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!status || status.isOpen) return null;

  const manual =
    status.reason === "manual_timed" || status.reason === "manual_indefinite";

  const when = status.reopensAt
    ? (() => {
        const at = new Date(status.reopensAt);
        const time = formatSofiaTime(at);
        const offset = sofiaDayOffset(new Date(status.serverTime), at);
        if (offset <= 0) return `в ${time}`;
        if (offset === 1) return `утре в ${time}`;
        const date = new Intl.DateTimeFormat("bg-BG", {
          timeZone: "Europe/Sofia",
          day: "2-digit",
          month: "2-digit",
        }).format(at);
        return `на ${date} в ${time}`;
      })()
    : null;

  const line =
    status.reason === "manual_indefinite"
      ? "Заведението е затворено до ръчно отваряне. Няма да постъпват нови поръчки, докато не натиснете бутона."
      : status.reason === "manual_timed"
        ? when
          ? `Заведението е затворено. Отваря се автоматично ${when} — не е нужно да правите нищо.`
          : "Заведението е затворено."
        : when
          ? `Извън работно време. Поръчките тръгват отново ${when}.`
          : "Извън работно време.";

  function handleReopen() {
    setError(null);
    startReopen(async () => {
      const result = await openStoreAction();
      if (!result.ok) {
        setError(result.error ?? "Неуспешно отваряне.");
        return;
      }
      await onReopened();
    });
  }

  return (
    <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4">
      <p className="text-lg font-bold text-amber-900">🔒 Затворено</p>
      <p className="mt-1 text-amber-900">{line}</p>

      {manual && (
        <button
          type="button"
          onClick={handleReopen}
          disabled={reopening}
          className="mt-4 rounded-2xl bg-pizza-green px-6 py-3 text-lg font-bold text-white transition hover:bg-pizza-green-dark disabled:opacity-60"
        >
          {reopening ? "Отваря се…" : "▶ Отвори заведението"}
        </button>
      )}

      {error && <p className="mt-2 font-semibold text-red-600">{error}</p>}
    </div>
  );
}
