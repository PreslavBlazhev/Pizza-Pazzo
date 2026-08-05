"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { updateOrderStatusAction } from "@/app/actions/order-admin";
import {
  clearStoredShift,
  getAudioContext,
  isAudioRunning,
  readStoredShift,
  releaseAudio,
  storeShift,
  unlockAudio,
} from "@/lib/shift-session";
import type { Order, OrderWithItems } from "@/types/order";
import { PRINT_TEMPLATE_IDS, defaultPrintTemplate, type PrintTemplateData } from "@/types/print";
import type { StoreStatus } from "@/types/store-status";

/**
 * The shift, for the WHOLE admin panel.
 *
 * The owner's requirement is blunt and non-negotiable: while the restaurant is
 * open and a shift is running, a new order must set off the alarm — on the
 * live board, on Табло, in Продукти, anywhere. So the polling, the siren and
 * the shift state live here, in a provider mounted by the admin layout, and
 * not in the board that used to own them. Walking to another screen no longer
 * takes the alarm with it.
 *
 * There is exactly ONE of these per document, which is what keeps the siren
 * from doubling and the polling from multiplying. `LiveOrdersBoard` reads this
 * context instead of holding its own copy.
 *
 * The shift itself belongs to the device — localStorage plus a module-scope
 * AudioContext (`lib/shift-session.ts`) — so it survives navigation and page
 * reloads. Two things end it: "Приключи смяна", and the restaurant closing.
 */

const POLL_INTERVAL_MS = 8_000;
/** Off shift there is nothing to ring about; we only track the open/closed state. */
const IDLE_POLL_INTERVAL_MS = 30_000;
/** How often we re-check whether the browser is really letting sound out. */
const AUDIO_CHECK_MS = 1_500;

/**
 * Does this closure end the shift?
 *
 * Closing the restaurant ends the shift — but a timed pause is not "closing",
 * it is the kitchen catching its breath, and it reopens on its own with nobody
 * touching the tablet. Ending the shift there would leave the panel silent at
 * the exact moment orders start arriving again, because the alarm needs a
 * fresh tap to make sound. So a timed pause keeps the shift; the end of the
 * working day and "до ръчно отваряне" end it.
 */
export function closureEndsShift(status: StoreStatus | null): boolean {
  if (!status || status.isOpen) return false;
  return status.reason !== "manual_timed";
}

interface ShiftContextValue {
  /** False until the stored shift has been read in the browser. */
  hydrated: boolean;
  shiftStarted: boolean;
  /** True while the browser is refusing to make sound — the alarm is mute. */
  audioBlocked: boolean;
  orders: Order[];
  acceptedOrders: OrderWithItems[];
  printTemplates: PrintTemplateData[];
  storeStatus: StoreStatus | null;
  connectionLost: boolean;
  lastCheck: Date | null;
  busyOrderId: string | null;
  startShift: () => void;
  endShift: () => void;
  /** Re-grabs the speaker after the browser suspended it. */
  unlockSound: () => void;
  refresh: () => Promise<void>;
  submitStatus: (orderId: string, fields: Record<string, string>) => Promise<void>;
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [shiftStarted, setShiftStarted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  // Seeded from the defaults so the print buttons work on the very first
  // paint; every poll replaces them with whatever /admin/settings/print holds.
  const [printTemplates, setPrintTemplates] = useState<PrintTemplateData[]>(() =>
    PRINT_TEMPLATE_IDS.map(defaultPrintTemplate)
  );
  const [connectionLost, setConnectionLost] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  // Null until the first poll answers — nothing flashes "открито"/"затворено".
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  // Orders accepted this shift, kept so their kitchen ticket can still be
  // printed. They now survive leaving the board, like the shift itself.
  const [acceptedOrders, setAcceptedOrders] = useState<OrderWithItems[]>([]);

  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const hasPending = orders.length > 0;

  /**
   * Ends the shift on this device: forget it, hand the speaker back, drop the
   * print list. Idempotent — the poll calls it on every closed answer.
   */
  const endShift = useCallback(() => {
    setShiftStarted(false);
    setAudioBlocked(false);
    // The print list belongs to the shift that accepted those orders; older
    // tickets are still reachable from Поръчки.
    setAcceptedOrders((prev) => (prev.length ? [] : prev));
    clearStoredShift();
    releaseAudio();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pending-orders", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        orders: Order[];
        printTemplates?: PrintTemplateData[];
        storeStatus?: StoreStatus;
      };
      setOrders(data.orders);
      if (data.printTemplates?.length) setPrintTemplates(data.printTemplates);
      // A timed closure ends here: the poll after the deadline simply reports
      // the shop open again, and the notice disappears on its own.
      if (data.storeStatus) setStoreStatus(data.storeStatus);

      // The second way a shift ends. Waiting for the board to be empty is not
      // politeness: an order placed at 22:58 still has to be accepted at
      // 23:01, and ending the shift silences the alarm.
      if (closureEndsShift(data.storeStatus ?? null) && data.orders.length === 0) {
        endShift();
      }

      setConnectionLost(false);
      setLastCheck(new Date());
    } catch {
      setConnectionLost(true);
    }
  }, [endShift]);

  // Bring back the shift this device was left in — same day only.
  useEffect(() => {
    if (readStoredShift()) {
      setShiftStarted(true);
      // After an in-app navigation the audio context is still alive at module
      // scope; after a real reload it is not, and the prompt appears.
      setAudioBlocked(!isAudioRunning());
    }
    setHydrated(true);
  }, []);

  // Polling never stops while an admin screen is open: on shift because an
  // order may arrive any second, off shift only to know whether the shop is
  // open at all.
  useEffect(() => {
    const interval = shiftStarted ? POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
    void refresh();
    const id = setInterval(() => void refresh(), interval);
    return () => clearInterval(id);
  }, [shiftStarted, refresh]);

  // Is sound actually coming out? A shift resumed after a page reload has no
  // audio permission until someone touches the screen once more, and a silent
  // alarm is worse than no alarm — so we watch the context, not our intent.
  useEffect(() => {
    if (!shiftStarted) return;

    const sync = () => setAudioBlocked(!isAudioRunning());
    const onGesture = () => {
      unlockAudio();
      window.setTimeout(sync, 100);
    };

    sync();
    const id = setInterval(sync, AUDIO_CHECK_MS);
    // Any tap anywhere counts as the gesture the browser is waiting for.
    document.addEventListener("pointerdown", onGesture);
    return () => {
      clearInterval(id);
      document.removeEventListener("pointerdown", onGesture);
    };
  }, [shiftStarted]);

  // The alarm: a near-continuous two-tone siren (sawtooth, full volume) plus
  // vibration where supported — deliberately obnoxious, it must cut through
  // kitchen noise until every order is handled. This is the only place it
  // lives, so it keeps sounding across every admin screen.
  useEffect(() => {
    if (!shiftStarted || !hasPending) return;

    const siren = () => {
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== "running") return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      // Alternate high/low every 150 ms for one second — classic alarm wail.
      for (let i = 0; i < 7; i++) {
        osc.frequency.setValueAtTime(i % 2 === 0 ? 1600 : 950, t0 + i * 0.15);
      }
      gain.gain.setValueAtTime(0.9, t0);
      gain.gain.setValueAtTime(0.9, t0 + 1.0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.1);

      navigator.vibrate?.([400, 100, 400]);
    };

    siren();
    const id = setInterval(siren, 1200);
    return () => {
      clearInterval(id);
      navigator.vibrate?.(0);
    };
  }, [shiftStarted, hasPending]);

  // Keep the screen awake for the whole shift, on whichever admin screen the
  // tablet happens to be showing; reacquire when the tab becomes visible.
  useEffect(() => {
    if (!shiftStarted) return;

    const acquire = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock?.request("screen");
      } catch {
        // Not supported / not allowed — the tablet's own display settings apply.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [shiftStarted]);

  const startShift = useCallback(() => {
    // The click is the user gesture that unlocks audio for the rest of the day.
    unlockAudio();
    storeShift();
    setAudioBlocked(false); // the interval above corrects us if it lied
    setShiftStarted(true);
    void refresh();
  }, [refresh]);

  const unlockSound = useCallback(() => {
    unlockAudio();
    window.setTimeout(() => setAudioBlocked(!isAudioRunning()), 100);
  }, []);

  const submitStatus = useCallback(
    async (orderId: string, fields: Record<string, string>) => {
      setBusyOrderId(orderId);
      try {
        const fd = new FormData();
        fd.set("orderId", orderId);
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        const result = await updateOrderStatusAction(null, fd);
        // Keep the just-accepted order around (with the ETA the staff picked)
        // so its print button is available. Printing is NEVER automatic.
        if (result?.ok && fields.status === "ACCEPTED") {
          const accepted = orders.find((o) => o.id === orderId);
          if (accepted) {
            const withItems: OrderWithItems = {
              ...accepted,
              items: accepted.items ?? [],
              status: "ACCEPTED",
              estimatedTimeMinutes: Number(fields.estimatedTimeMinutes) || null,
              acceptedAt: new Date().toISOString(),
            };
            setAcceptedOrders((prev) =>
              [withItems, ...prev.filter((o) => o.id !== orderId)].slice(0, 8)
            );
          }
        }
        await refresh();
      } finally {
        setBusyOrderId(null);
      }
    },
    [orders, refresh]
  );

  return (
    <ShiftContext.Provider
      value={{
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
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
}

/** The shift state. Throws outside the admin layout — that is a wiring bug. */
export function useShift(): ShiftContextValue {
  const value = useContext(ShiftContext);
  if (!value) {
    throw new Error("useShift must be used inside <ShiftProvider> (the admin layout).");
  }
  return value;
}
