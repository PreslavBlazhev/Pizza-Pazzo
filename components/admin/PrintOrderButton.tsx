"use client";

import { useEffect, useRef, useState } from "react";
import {
  isAndroidPrinterAvailable,
  requestOrderPrint,
  PRINT_RESULT_EVENT,
  type PrintResultDetail,
  type PrintState,
} from "@/lib/android-printer";
import type { OrderWithItems } from "@/types/order";

/** If the app never reports back (e.g. it was killed mid-job), unlock the UI. */
const RESULT_TIMEOUT_MS = 45_000;

/**
 * "Принтирай поръчката" for an ACCEPTED order. Renders a real button only
 * inside the Pizza Pazzo Kitchen Android app (where window.AndroidPrinter
 * exists); in a normal browser it shows a short hint instead. Printing is
 * never automatic — it starts only on tap, and repeat prints are explicit
 * re-taps marked as reprints on the receipt.
 */
export function PrintOrderButton({ order }: { order: OrderWithItems }) {
  // Bridge detection must happen after mount: during SSR (and the first client
  // render) there is no `window`, and the markup must match.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<PrintState>("IDLE");
  const [message, setMessage] = useState<string | null>(null);
  const [printedOnce, setPrintedOnce] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAvailable(isAndroidPrinterAvailable());
  }, []);

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<PrintResultDetail>).detail;
      if (!detail || detail.orderId !== order.id) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (detail.success) {
        setState("SUCCESS");
        setPrintedOnce(true);
        setMessage(detail.message || "Принтирано успешно");
      } else {
        setState("ERROR");
        setMessage(detail.message || "Принтирането неуспешно");
      }
    };
    window.addEventListener(PRINT_RESULT_EVENT, onResult);
    return () => {
      window.removeEventListener(PRINT_RESULT_EVENT, onResult);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [order.id]);

  if (available === null) return null;

  if (!available) {
    return (
      <p className="text-sm text-neutral-500">
        🖨 Принтирането е достъпно през приложението Pizza Pazzo Kitchen.
      </p>
    );
  }

  const busy = state === "CONNECTING" || state === "PRINTING";

  const handlePrint = () => {
    if (busy) return; // double-tap guard (the app has its own lock as well)
    setState("CONNECTING");
    setMessage("Свързване с принтера…");
    const sent = requestOrderPrint(order, printedOnce);
    if (!sent) {
      setState("ERROR");
      setMessage("Принтерът не е достъпен.");
      return;
    }
    setState("PRINTING");
    timeoutRef.current = setTimeout(() => {
      setState("ERROR");
      setMessage("Няма отговор от принтера. Опитайте отново.");
    }, RESULT_TIMEOUT_MS);
  };

  const label = busy
    ? "Свързване с принтера…"
    : state === "ERROR"
      ? "ОПИТАЙ ОТНОВО"
      : printedOnce
        ? "ПРИНТИРАЙ ОТНОВО"
        : "🖨 ПРИНТИРАЙ ПОРЪЧКАТА";

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={handlePrint}
        className={`w-full rounded-2xl px-6 py-3.5 text-lg font-extrabold text-white shadow-md transition disabled:opacity-60 sm:w-auto ${
          state === "ERROR"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-pizza-ink hover:bg-neutral-700"
        }`}
      >
        {label}
      </button>
      {state === "SUCCESS" && (
        <p className="text-sm font-semibold text-pizza-green-dark">
          ✓ {message ?? "Принтирано успешно"}
          {printedOnce && " · повторният печат се отбелязва на бележката"}
        </p>
      )}
      {state === "ERROR" && (
        <p className="text-sm font-semibold text-red-600">
          ✕ Принтирането неуспешно{message ? `: ${message}` : ""}
        </p>
      )}
    </div>
  );
}
