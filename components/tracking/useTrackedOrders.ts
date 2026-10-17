"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeliveryMethod, OrderStatus } from "@/types/order";

/** One order as the tracking API returns it (no personal data). */
export interface TrackedOrderView {
  key: string;
  orderNumber: number;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  createdAt: string;
  acceptedAt: string | null;
  estimatedTimeMinutes: number | null;
  updatedAt: string;
  expiresAt: string;
  isTest: boolean;
}

/** How often an open page asks again. Statuses change in minutes, not seconds. */
export const TRACK_POLL_MS = 15_000;

export type TrackSource = { kind: "mine" } | { kind: "token"; token: string };

/**
 * Polls the tracking API for the real, last written status — nothing here
 * advances a status by itself or by a timer.
 *
 *   - polls every 15 s while the tab is visible; a hidden tab does not poll;
 *   - asks at once when the tab becomes visible again or the device comes
 *     back online;
 *   - says when the connection is lost, and when it last heard back;
 *   - at the orders' expiry (22:30) it drops them on the dot, even offline,
 *     and stops polling: the order and its tracking end together.
 *
 * Nothing is written to localStorage, sessionStorage or IndexedDB; the only
 * credential is the HttpOnly cookie (or, for an e-mail link, the token held
 * in memory for this page).
 */
export function useTrackedOrders(source: TrackSource | null, enabled = true) {
  const [orders, setOrders] = useState<TrackedOrderView[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [cutoffAt, setCutoffAt] = useState<string | null>(null);
  const inFlight = useRef(false);
  /** How many orders the last answer showed — to tell "expired" from "none". */
  const shownCount = useRef(0);
  const sourceKey = source ? (source.kind === "token" ? `t:${source.token}` : "mine") : null;

  const load = useCallback(async () => {
    if (!source || inFlight.current) return;
    inFlight.current = true;
    try {
      const res =
        source.kind === "token"
          ? await fetch("/api/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: source.token }),
              cache: "no-store",
              credentials: "same-origin",
              referrerPolicy: "no-referrer",
            })
          : await fetch("/api/track", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 404) {
        setOrders([]);
        setExpired(true);
        setConnectionLost(false);
        setLastUpdated(new Date());
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        orders?: TrackedOrderView[];
        order?: TrackedOrderView & { token?: string };
        cutoffAt?: string;
      };
      const list = data.order
        ? [{ ...data.order, token: undefined, key: `n${data.order.orderNumber}` }]
        : (data.orders ?? []);
      const next = list as TrackedOrderView[];
      // Orders that were on screen and are no longer returned have expired
      // (22:30) — say so, rather than "you have no order".
      setExpired(next.length === 0 && shownCount.current > 0);
      shownCount.current = next.length;
      setOrders(next);
      if (data.cutoffAt) setCutoffAt(data.cutoffAt);
      setConnectionLost(false);
      setLastUpdated(new Date());
    } catch {
      setConnectionLost(true);
    } finally {
      inFlight.current = false;
    }
    // sourceKey captures the identity of `source`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // Poll while visible; pause while hidden.
  useEffect(() => {
    if (!source || !enabled || expired) return;
    const first = window.setTimeout(() => void load(), 0);
    let id: number | null = null;
    const start = () => {
      if (id === null) id = window.setInterval(() => void load(), TRACK_POLL_MS);
    };
    const stop = () => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
        start();
      } else {
        stop();
      }
    };
    const onOnline = () => void load();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    return () => {
      window.clearTimeout(first);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, enabled, expired, load]);

  // Expiry: the earliest expiry of what is on screen (or the next cutoff).
  useEffect(() => {
    const times = [
      ...(orders ?? []).map((o) => new Date(o.expiresAt).getTime()),
      ...(cutoffAt && (orders?.length ?? 0) > 0 ? [new Date(cutoffAt).getTime()] : []),
    ].filter((t) => Number.isFinite(t));
    if (times.length === 0) return;
    const at = Math.min(...times);
    const clear = () => {
      setOrders([]);
      setExpired(true);
    };
    const id = window.setTimeout(clear, Math.max(0, at - Date.now()) + 250);
    return () => window.clearTimeout(id);
  }, [orders, cutoffAt]);

  return { orders, expired, connectionLost, lastUpdated, refresh: load };
}
