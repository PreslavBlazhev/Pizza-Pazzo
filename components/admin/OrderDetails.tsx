import type { Order } from "@/types/order";
import { formatEurPrice } from "@/lib/format-price";
import { extraLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import { formatDateTime } from "@/lib/utils";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderStatusControl } from "./OrderStatusControl";
import { PrintOrderButtons } from "./PrintOrderButton";
import type { PrintTemplateData } from "@/types/print";
import { PaymentBadge } from "./PaymentBadge";
import { RecheckPaymentButton } from "./RecheckPaymentButton";
import type { AdminPaymentAttempt } from "@/lib/payments/admin";
import { formatMinor } from "@/lib/payments/money";
import {
  ATTEMPT_STATUS_LABELS_BG,
  collectInstructionBg,
  paymentAlertLabel,
  type AttemptStatus,
} from "@/lib/payments/status";

/** Where the restaurant's "new order" e-mail stands — honestly. */
function NotificationLine({ order }: { order: Order }) {
  const s = order.notificationStatus;
  if (!s || s === "LEGACY") return null;
  const text =
    s === "SENT"
      ? "Имейл към ресторанта: изпратен."
      : s === "SKIPPED"
        ? `Имейл към ресторанта: не е изпращан (${order.notificationError ?? "—"}).`
        : s === "SENDING"
          ? "Имейл към ресторанта: изпраща се…"
          : `Имейл към ресторанта: НЕУСПЕШЕН (опит ${order.notificationAttempts} от 5): ${
              order.notificationError ?? "—"
            }. Системата опитва отново автоматично, докато таблото „Поръчки на живо“ е отворено.`;
  return (
    <p className={`text-sm ${s === "FAILED" ? "font-semibold text-red-700" : "text-neutral-600"}`}>
      {text}
    </p>
  );
}

export function OrderDetails({
  order,
  printTemplates,
  paymentAttempts = [],
}: {
  order: Order;
  printTemplates: PrintTemplateData[];
  paymentAttempts?: AdminPaymentAttempt[];
}) {
  // A card order the provider has not confirmed is not an order to cook: it
  // can only be cancelled (e.g. an abandoned payment) — see order-admin.ts.
  const awaitingMoney =
    !order.releasedToKitchenAt ||
    (order.paymentMethod === "CARD_ONLINE" && order.paymentStatus !== "PAID");
  const alert = paymentAlertLabel(order.paymentAlert);
  const items = order.items ?? [];

  const priceRow = (label: string, eur: number, strong = false) => (
    <div
      className={`flex items-baseline justify-between ${
        strong
          ? "border-t border-neutral-200 pt-2 font-semibold text-neutral-800"
          : "text-neutral-500"
      }`}
    >
      <span>{label}</span>
      <span>{formatEurPrice(eur)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-neutral-800">#{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
        <PaymentBadge order={order} size="lg" />
        <span className="text-sm text-neutral-400">{formatDateTime(order.createdAt)}</span>
      </div>

      {alert && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-600 bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          ⚠ {alert}
        </div>
      )}

      {order.isTest && (
        <div className="rounded-2xl border-2 border-fuchsia-500 bg-fuchsia-50 p-3 text-sm font-semibold text-fuchsia-900">
          Тестова поръчка (симулатор / банков sandbox) — без реални пари. Не се приготвя.
        </div>
      )}

      {awaitingMoney && order.status !== "CANCELLED" && (
        <div className="rounded-2xl border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-700">
          Тази поръчка още НЕ е изпратена към кухнята: плащането с карта не е потвърдено от
          доставчика. Ако клиентът не завърши плащането, поръчката може само да бъде отказана.
        </div>
      )}

      {(order.estimatedTimeMinutes !== null || order.adminNote) && (
        <div className="space-y-0.5 text-sm text-neutral-600">
          {order.estimatedTimeMinutes !== null && (
            <p>
              Ориентировъчно време: <strong>{order.estimatedTimeMinutes} мин</strong>
              {order.acceptedAt && (
                <span className="text-neutral-400"> · прието {formatDateTime(order.acceptedAt)}</span>
              )}
            </p>
          )}
          {order.adminNote && <p>Бележка (админ): {order.adminNote}</p>}
        </div>
      )}

      {/* Status control */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-600">Смяна на статус</h2>
        <OrderStatusControl
          orderId={order.id}
          status={order.status}
          cancelOnly={awaitingMoney}
        />
      </section>

      {/* Kitchen ticket — only after the order is accepted, never for pending
          or cancelled ones. Real button only inside the Android kitchen app. */}
      {order.status !== "PENDING" && order.status !== "CANCELLED" && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-600">Бележки за печат</h2>
          <PrintOrderButtons
            order={{ ...order, items: order.items ?? [] }}
            templates={printTemplates}
          />
        </section>
      )}

      {/* A customer who deleted their account left this order behind as an
          accounting record — the sums and the items are still here, the person
          is not. Saying so is clearer for staff than four empty fields. */}
      {order.anonymizedAt ? (
        <section className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-neutral-600">Клиент</h2>
          <p className="text-sm text-neutral-700">
            Профилът е изтрит по искане на клиента. Данните му за контакт и адресът
            са премахнати от поръчката на {formatDateTime(order.anonymizedAt)}.
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Сумите, артикулите и номерът на поръчката остават за счетоводството.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h2 className="mb-1 text-sm font-semibold text-neutral-600">Клиент</h2>
            <p className="text-sm text-neutral-700">
              {order.customerName} · {order.customerPhone}
            </p>
            <p className="text-sm text-neutral-500">{order.customerEmail || "— без имейл"}</p>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-neutral-600">Доставка</h2>
            <p className="text-sm text-neutral-700">
              {order.deliveryAddress}, {order.deliveryCity}
            </p>
            {order.deliveryNote && (
              <p className="text-sm text-neutral-500">Бележка: {order.deliveryNote}</p>
            )}
          </section>
        </>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Продукти</h2>
        <ul className="divide-y divide-neutral-100">
          {items.map((item) => {
            // Extras come from the order's immutable snapshot — never from the
            // live menu, so an edited product cannot rewrite an old order.
            const extras = toOrderExtrasDisplay(item.extras, "bg");
            return (
              <li key={item.id} className="py-2">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-neutral-700">
                    {item.quantity}× {item.productNameBg}
                    {item.variantName ? (
                      <span className="text-neutral-400"> ({item.variantName})</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-neutral-700">
                    {formatEurPrice(item.totalPriceEur)}
                  </span>
                </div>

                {extras.length > 0 && (
                  <div className="mt-1.5 border-l-2 border-neutral-200 pl-3">
                    <p className="text-xs font-medium text-neutral-500">
                      {item.quantity > 1 ? "Добавки за всяка бройка:" : "Добавки:"}
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {extras.map((e, n) => (
                        <li
                          key={`${item.id}-${n}`}
                          className="flex items-start justify-between gap-3 text-xs text-neutral-600"
                        >
                          <span className="break-words">+ {extraLabel(e)}</span>
                          <span className="shrink-0 whitespace-nowrap">
                            {formatEurPrice(e.totalPriceEur)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="max-w-xs space-y-2 text-sm">
        {priceRow("Общо", order.totalEur, true)}
      </section>

      {/* Proof of the checkout confirmations (UBB-16). Orders from before
          2026-09-29 have none — and none is invented for them. */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold text-neutral-600">Потвърждения при поръчката</h2>
        {order.consent.recordedAt ? (
          <ul className="space-y-0.5 text-neutral-700">
            <li>Общи условия — версия {order.consent.termsVersion}</li>
            <li>Отказ, връщане и рекламации — версия {order.consent.refundsVersion}</li>
            <li>Политика за поверителност (запознат) — версия {order.consent.privacyVersion}</li>
            <li className="text-neutral-500">Сървърно време: {formatDateTime(order.consent.recordedAt)}</li>
          </ul>
        ) : (
          <p className="text-neutral-500">
            Няма записани потвърждения — поръчката е направена преди въвеждането им (29.09.2026).
          </p>
        )}
      </section>

      {/* A card order that was PAID and then cancelled: the money is still
          with the restaurant. The refund is made in the bank's virtual-POS
          portal — this site never "refunds" by changing a status. */}
      {order.status === "CANCELLED" &&
        order.paymentMethod === "CARD_ONLINE" &&
        order.paymentStatus === "PAID" &&
        !order.isTest && (
          <section className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <h2 className="font-bold">Дължи се възстановяване по картата</h2>
            <p className="mt-1">
              Поръчката е платена с карта и е отказана. Направете възстановяване на{" "}
              <strong>{formatEurPrice(order.totalEur)}</strong> от портала на банката
              (виртуалния ПОС) по същата карта — без неоправдано забавяне, най-късно до 14 дни.
              Обадете се на клиента. Процедура: docs/UBB-OPERATIONS.md.
            </p>
          </section>
        )}

      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-600">Плащане</h2>
        <p className="text-sm font-bold text-neutral-800">
          {collectInstructionBg(
            order.paymentMethod,
            order.paymentStatus,
            formatEurPrice(order.totalEur)
          )}
        </p>
        <NotificationLine order={order} />
        {order.paidAt && (
          <p className="text-sm text-neutral-600">
            Потвърдено от доставчика: {formatDateTime(order.paidAt)}
          </p>
        )}

        {order.paymentMethod === "CARD_ONLINE" && (
          <>
            {paymentAttempts.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Клиентът още не е отворил страницата за плащане.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Опит</th>
                      <th className="py-1 pr-3 font-medium">Статус</th>
                      <th className="py-1 pr-3 font-medium">Сума</th>
                      <th className="py-1 pr-3 font-medium">Доставчик</th>
                      <th className="py-1 font-medium">Време</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-700">
                    {paymentAttempts.map((a) => (
                      <tr key={a.id}>
                        <td className="py-1.5 pr-3 font-mono">{a.reference}</td>
                        <td className="py-1.5 pr-3">
                          {ATTEMPT_STATUS_LABELS_BG[a.status as AttemptStatus] ?? a.status}
                          {a.providerStatus ? (
                            <span className="text-neutral-400"> ({a.providerStatus})</span>
                          ) : null}
                          {a.failureReason ? (
                            <span className="block text-red-700">{a.failureReason}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-3">
                          {formatMinor(a.amountMinor, a.currency)}
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.provider} / {a.environment}
                        </td>
                        <td className="whitespace-nowrap py-1.5">
                          {formatDateTime(a.createdAt)}
                          {a.finalizedAt ? (
                            <span className="block text-neutral-400">
                              край {formatDateTime(a.finalizedAt)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {order.paymentStatus !== "PAID" && paymentAttempts.length > 0 && (
              <RecheckPaymentButton orderId={order.id} />
            )}
            {order.paymentStatus === "PAID" && order.status === "CANCELLED" && (
              <p className="text-sm font-semibold text-red-700">
                Отказана, но платена поръчка: възстановяването се прави ръчно през портала на
                банката. Сайтът не връща пари и не отбелязва възстановяване сам.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
