"use client";

import { useEffect, useRef, useState } from "react";
import {
  isAndroidPrinterAvailable,
  isCombinedPrintAvailable,
  requestCombinedPrintJson,
  requestPrintJson,
  PRINT_RESULT_EVENT,
  type PrintResultDetail,
  type PrintState,
} from "@/lib/android-printer";
import type { OrderWithItems } from "@/types/order";
import { PRINT_TEMPLATE_IDS, type PrintTemplateData } from "@/types/print";

/** If the app never reports back (e.g. it was killed mid-job), unlock the UI. */
const RESULT_TIMEOUT_MS = 45_000;

/**
 * ONE "Принтиране" button per order: one print of one long ticket — the
 * kitchen ticket, 5 blank lines, then the delivery ticket, each in its own
 * unchanged layout from /admin/settings/print.
 *
 * Inside the Pizza Pazzo Android app it drives the Bluetooth thermal printer
 * as a single job (`printOrders`); the jobs are built by the SERVER
 * (…/printable) exactly as before. An older app build without `printOrders`
 * gets the two tickets one after the other instead, so printing never breaks
 * before the app is updated. In an ordinary browser it opens the combined print
 * page (one print dialog).
 *
 * Printing is never automatic — it starts only on tap, and repeat prints are
 * explicit re-taps marked as reprints on the ticket.
 */
export function PrintOrderButtons({
  order,
  templates,
  compact = false,
}: {
  order: OrderWithItems;
  templates: PrintTemplateData[];
  compact?: boolean;
}) {
  // Bridge detection must happen after mount: during SSR (and the first client
  // render) there is no `window`, and the markup must match.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<PrintState>("IDLE");
  const [message, setMessage] = useState<string | null>(null);
  const [printedOnce, setPrintedOnce] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Older app only: jobs still to send after the current one succeeds. */
  const queueRef = useRef<string[]>([]);

  // Kitchen first, delivery second — regardless of how the list arrived.
  const templateIds = [...templates]
    .map((t) => t.id)
    .sort((a, b) => PRINT_TEMPLATE_IDS.indexOf(a) - PRINT_TEMPLATE_IDS.indexOf(b));

  useEffect(() => {
    setAvailable(isAndroidPrinterAvailable());
  }, []);

  const armTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      queueRef.current = [];
      setState("ERROR");
      setMessage("Няма отговор от принтера. Опитайте отново.");
    }, RESULT_TIMEOUT_MS);
  };

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<PrintResultDetail>).detail;
      if (!detail || detail.orderId !== order.id) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (detail.success) {
        const next = queueRef.current.shift();
        if (next && requestPrintJson(next)) {
          armTimeout();
          return;
        }
        setState("SUCCESS");
        setPrintedOnce(true);
        setMessage(detail.message || "Принтирано успешно");
      } else {
        queueRef.current = [];
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

  const buttonClass = `rounded-2xl font-extrabold uppercase tracking-wide text-white shadow-md transition disabled:opacity-60 ${
    compact ? "px-6 py-3 text-xl" : "w-full px-8 py-4 text-2xl sm:w-auto"
  }`;

  // Plain browser: open the combined print page (one print dialog).
  if (!available) {
    return (
      <a
        href={`/admin/orders/${order.id}/print?t=all`}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block bg-pizza-ink hover:bg-neutral-700 ${buttonClass}`}
      >
        🖨 Принтиране
      </a>
    );
  }

  const busy = state === "CONNECTING" || state === "PRINTING";

  const handlePrint = async () => {
    if (busy) return; // double-tap guard (the app has its own lock as well)
    setState("CONNECTING");
    setMessage("Свързване с принтера…");
    // The jobs are built by the SERVER from the order as it is now: an order
    // that does not exist is refused there and nothing is printed.
    let jsons: string[] | null = null;
    try {
      jsons = await Promise.all(
        templateIds.map(async (id) => {
          const res = await fetch(
            `/api/admin/orders/${encodeURIComponent(order.id)}/printable?t=${id.toLowerCase()}${
              printedOnce ? "&reprint=1" : ""
            }`,
            { cache: "no-store" }
          );
          if (res.status === 404) throw new Error("not_found");
          if (!res.ok) throw new Error(String(res.status));
          const json = ((await res.json()) as { json?: string }).json;
          if (!json) throw new Error("empty");
          return json;
        })
      );
    } catch (error) {
      setState("ERROR");
      setMessage(
        error instanceof Error && error.message === "not_found"
          ? "Поръчката не е намерена."
          : "Няма връзка със сървъра — опитайте отново."
      );
      return;
    }
    let sent: boolean;
    if (isCombinedPrintAvailable()) {
      queueRef.current = [];
      sent = requestCombinedPrintJson(jsons);
    } else {
      const [first, ...rest] = jsons;
      queueRef.current = rest;
      sent = requestPrintJson(first);
    }
    if (!sent) {
      queueRef.current = [];
      setState("ERROR");
      setMessage("Принтерът не е достъпен.");
      return;
    }
    setState("PRINTING");
    armTimeout();
  };

  const label = busy ? "Принтиране…" : "🖨 Принтиране";

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handlePrint()}
        className={`${buttonClass} ${state === "ERROR" ? "bg-red-600 hover:bg-red-700" : "bg-pizza-ink hover:bg-neutral-700"}`}
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
