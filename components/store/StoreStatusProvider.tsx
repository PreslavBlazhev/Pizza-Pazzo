"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { formatSofiaTime, sofiaDayOffset } from "@/lib/store-hours";
import type { StoreStatus } from "@/types/store-status";

/**
 * Makes "is the restaurant open?" available to every customer-facing control.
 *
 * The answer is fetched in the browser rather than rendered into the HTML on
 * purpose: most public pages are prerendered, so a server-rendered flag would
 * be frozen at build time and a shop closed at 19:40 would keep taking orders
 * from a cached page. Fetching also means a tab left open on the menu notices
 * the shop reopening without a reload.
 *
 * While the answer is unknown (first paint, or the request failed) the UI
 * behaves as if OPEN. A visitor must never be blocked by a network hiccup —
 * the real gate is `createOrder`, which re-checks on the server and refuses
 * there. The dialog and the disabled buttons are courtesy, not enforcement.
 */

const StoreStatusContext = createContext<StoreStatus | null>(null);

/** Background refresh while the tab is in the foreground. */
const REFRESH_INTERVAL_MS = 60_000;

/** Small cushion so a reopen re-fetch lands after the deadline, never on it. */
const REOPEN_BUFFER_MS = 2_000;

export function StoreStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/store-status", { cache: "no-store" });
      if (!res.ok) return;
      setStatus((await res.json()) as StoreStatus);
    } catch {
      // Keep whatever we last knew; the next tick tries again.
    }
  }, []);

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_INTERVAL_MS);

    // Coming back to a backgrounded tab is the moment a stale answer is most
    // likely and most visible.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // A timed closure ends at a known instant — ask again right then instead of
  // making the visitor wait out the polling interval.
  useEffect(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (!status || status.isOpen || !status.reopensAt) return;

    // Measured against the SERVER clock we were given, so a device with the
    // wrong time still waits the right amount.
    const delay =
      new Date(status.reopensAt).getTime() -
      new Date(status.serverTime).getTime() +
      REOPEN_BUFFER_MS;
    if (delay <= 0 || delay > 24 * 3_600_000) return;

    timeoutRef.current = window.setTimeout(() => void refresh(), delay);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [status, refresh]);

  return (
    <StoreStatusContext.Provider value={status}>{children}</StoreStatusContext.Provider>
  );
}

/** The current status, or null while it is still unknown. */
export function useStoreStatus(): StoreStatus | null {
  return useContext(StoreStatusContext);
}

/**
 * True only when we KNOW the shop is closed. Unknown counts as open — see the
 * note at the top about failing open in the UI.
 */
export function useStoreClosed(): boolean {
  const status = useStoreStatus();
  return status !== null && !status.isOpen;
}

/**
 * The sentence shown to the customer: why it is closed and when orders resume.
 * Returns null while the shop is open (or the status is unknown).
 *
 * The instant is formatted here rather than in an ICU message because it must
 * be rendered in Europe/Sofia, not in the visitor's timezone — a customer in
 * London must still read "отваряме в 11:00", the restaurant's clock.
 */
export function useStoreClosedMessage(): string | null {
  const t = useTranslations("store");
  const status = useStoreStatus();

  if (!status || status.isOpen) return null;

  if (!status.reopensAt) {
    return status.reason === "manual_indefinite"
      ? t("closedIndefinite")
      : t("closedUnknown");
  }

  const at = new Date(status.reopensAt);
  const time = formatSofiaTime(at);
  const offset = sofiaDayOffset(new Date(status.serverTime), at);
  const date = new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "2-digit",
  }).format(at);

  // The wording differs by cause: a manual pause is a pause ("приемаме поръчки
  // отново"), the end of the working day is the normal schedule ("работим
  // отново") — the customer should not read a closed evening as a hiccup.
  if (status.reason === "hours") {
    if (offset <= 0) return t("closedHoursToday", { time });
    if (offset === 1) return t("closedHoursTomorrow", { time });
    return t("closedHoursDate", { date, time });
  }

  if (offset <= 0) return t("closedTemporaryToday", { time });
  if (offset === 1) return t("closedTemporaryTomorrow", { time });
  return t("closedTemporaryDate", { date, time });
}
