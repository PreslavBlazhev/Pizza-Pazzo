"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatSofiaTime } from "@/lib/store-hours";
import { useTrackedOrders, type TrackSource, type TrackedOrderView } from "./useTrackedOrders";
import type { DeliveryMethod, OrderStatus } from "@/types/order";

type StepId = "sent" | "preparing" | "ready" | "onTheWay" | "done";

/** The steps a customer sees — no delivery step for an order collected in person. */
export function trackingSteps(method: DeliveryMethod): StepId[] {
  return method === "PICKUP"
    ? ["sent", "preparing", "ready", "done"]
    : ["sent", "preparing", "ready", "onTheWay", "done"];
}

/** Which step a status is on (CANCELLED has none — it is shown as an end state). */
export function stepOf(status: OrderStatus): StepId | null {
  switch (status) {
    case "PENDING":
      return "sent";
    case "ACCEPTED":
    case "PREPARING":
      return "preparing";
    case "READY":
      return "ready";
    case "OUT_FOR_DELIVERY":
      return "onTheWay";
    case "DELIVERED":
      return "done";
    default:
      return null;
  }
}

type StepMessage = StepId | "readyPickup" | "donePickup";

function stepKey(step: StepId, method: DeliveryMethod): StepMessage {
  if (method === "PICKUP" && step === "ready") return "readyPickup";
  if (method === "PICKUP" && step === "done") return "donePickup";
  return step;
}

export function OrderSteps({ order }: { order: TrackedOrderView }) {
  const t = useTranslations("tracking");
  if (order.status === "CANCELLED") {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700" data-testid="track-cancelled">
        {t("cancelled")}
      </p>
    );
  }
  const steps = trackingSteps(order.deliveryMethod);
  const current = stepOf(order.status);
  const index = current ? steps.indexOf(current) : -1;
  return (
    <ol className="space-y-2" data-testid="track-steps">
      {steps.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li
            key={step}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
              active ? "bg-pizza-green/10 font-bold text-pizza-green-dark" : done ? "text-pizza-ink" : "text-pizza-muted"
            }`}
            aria-current={active ? "step" : undefined}
            data-step={step}
            data-state={active ? "active" : done ? "done" : "todo"}
          >
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
                active
                  ? "border-pizza-green bg-pizza-green text-white"
                  : done
                    ? "border-pizza-green text-pizza-green"
                    : "border-pizza-cream-dark"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span>{t(`steps.${stepKey(step, order.deliveryMethod)}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OrderCard({ order }: { order: TrackedOrderView }) {
  const t = useTranslations("tracking");
  return (
    <article
      className="rounded-3xl border border-pizza-cream-dark bg-white p-5 shadow-soft"
      data-testid={`track-order-${order.orderNumber}`}
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold text-pizza-ink">
          {t("orderNumber", { number: order.orderNumber })}
        </h2>
        <span className="text-sm text-pizza-muted">
          {order.deliveryMethod === "PICKUP" ? t("pickup") : t("delivery")}
        </span>
      </header>
      {order.isTest && <p className="mb-3 text-sm font-semibold text-amber-700">{t("test")}</p>}
      <OrderSteps order={order} />
      {order.estimatedTimeMinutes && order.acceptedAt && order.status !== "CANCELLED" && order.status !== "DELIVERED" && (
        <p className="mt-4 text-sm text-pizza-ink">
          {t("estimate", {
            minutes: order.estimatedTimeMinutes,
            time: formatSofiaTime(new Date(new Date(order.acceptedAt).getTime() + order.estimatedTimeMinutes * 60_000)),
          })}
        </p>
      )}
      <p className="mt-2 text-xs text-pizza-muted">
        {t("expiresNote", { time: formatSofiaTime(new Date(order.expiresAt)) })}
      </p>
    </article>
  );
}

function tokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9._-]{20,100})/.exec(hash);
  return m ? m[1] : null;
}

/** The URL fragment as an external store: "" on the server, the real one in the browser. */
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const SERVER_HASH = "\u0000server";

/**
 * The /track page. With a token in the URL fragment (the e-mail link) it
 * follows that one order; without, every current order of this visitor
 * (cookie + signed-in account). The fragment is removed from the address bar
 * once the order is found — the token then lives only in the HttpOnly cookie.
 */
export function TrackingView() {
  const t = useTranslations("tracking");
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => SERVER_HASH
  );
  // The token is read once: removing the fragment from the address bar
  // (below) must not switch the page over to the cookie view.
  const onServer = hash === SERVER_HASH;
  const source = useMemo<TrackSource | null>(() => {
    if (onServer) return null;
    const token = tokenFromHash(hash);
    return token ? { kind: "token", token } : { kind: "mine" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onServer]);

  const { orders, expired, connectionLost, lastUpdated, refresh } = useTrackedOrders(source);

  useEffect(() => {
    if (source?.kind === "token" && orders && orders.length > 0 && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [source, orders]);

  if (!source || orders === null) {
    return <p className="text-pizza-muted">{t("loading")}</p>;
  }

  return (
    <div className="space-y-5" data-testid="tracking-view">
      {connectionLost && (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800" data-testid="track-offline">
          {t("connectionLost")}{" "}
          <button type="button" className="underline" onClick={() => void refresh()}>
            {t("retry")}
          </button>
        </p>
      )}
      {orders.length === 0 ? (
        <div className="rounded-3xl border border-pizza-cream-dark bg-white p-6 text-center" data-testid="track-empty">
          <p className="font-semibold text-pizza-ink">{expired ? t("expired") : t("none")}</p>
          <Link href="/menu" className="mt-4 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-white">
            {t("toMenu")}
          </Link>
        </div>
      ) : (
        orders.map((o) => <OrderCard key={o.key} order={o} />)
      )}
      {lastUpdated && (
        <p className="text-xs text-pizza-muted" data-testid="track-updated">
          {t("lastUpdated", { time: formatSofiaTime(lastUpdated) })}
        </p>
      )}
    </div>
  );
}

/**
 * The home page's compact card. Shows only when this visitor has a current
 * order; no modal, nothing on every refresh — a quiet card that opens /track.
 */
export function TrackOrderCard() {
  const t = useTranslations("tracking");
  const { orders } = useTrackedOrders({ kind: "mine" });
  if (!orders || orders.length === 0) return null;
  return (
    <section className="container mt-6" data-testid="track-card">
      <Link
        href="/track"
        className="flex items-center justify-between gap-4 rounded-3xl border-2 border-pizza-green/40 bg-white px-5 py-4 shadow-soft transition hover:border-pizza-green"
      >
        <span>
          <span className="block font-display text-lg font-bold text-pizza-ink">{t("cardTitle")}</span>
          <span className="block text-sm text-pizza-muted">
            {orders
              .slice(0, 3)
              .map((o) => `#${o.orderNumber} — ${o.status === "CANCELLED" ? t("cancelledShort") : t(`steps.${stepKey(stepOf(o.status) ?? "sent", o.deliveryMethod)}`)}`)
              .join(" · ")}
          </span>
        </span>
        <span aria-hidden className="text-2xl text-pizza-green">→</span>
      </Link>
    </section>
  );
}
