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
import { printTemplateLabel, type PrintTemplateData, type PrintTemplateId } from "@/types/print";

/** If the app never reports back (e.g. it was killed mid-job), unlock the UI. */
const RESULT_TIMEOUT_MS = 45_000;

/**
 * Prints one ticket for an order.
 *
 * Inside the Pizza Pazzo Kitchen Android app it drives the Bluetooth thermal
 * printer; in an ordinary browser it links to the print page instead, so the
 * owner is never left without a way to get the ticket out. Both paths use the
 * same template from /admin/settings/print.
 *
 * Printing is never automatic — it starts only on tap, and repeat prints are
 * explicit re-taps marked as reprints on the ticket.
 */
export function PrintOrderButton({
  order,
  templateId,
  template,
  compact = false,
}: {
  order: OrderWithItems;
  templateId: PrintTemplateId;
  /** Resolved layout. Absent → the app falls back to its built-in layout. */
  template?: PrintTemplateData;
  compact?: boolean;
}) {
  // Bridge detection must happen after mount: during SSR (and the first client
  // render) there is no `window`, and the markup must match.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<PrintState>("IDLE");
  const [message, setMessage] = useState<string | null>(null);
  const [printedOnce, setPrintedOnce] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ticketLabel = printTemplateLabel(templateId);

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

  // Plain browser: open the print page for this template.
  if (!available) {
    return (
      <a
        href={`/admin/orders/${order.id}/print?t=${templateId.toLowerCase()}`}
        target="_blank"
        rel="noopener noreferrer"
        className={
          compact
            ? "inline-block rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
            : "inline-block rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
        }
      >
        🖨 Бележка: {ticketLabel}
      </a>
    );
  }

  const busy = state === "CONNECTING" || state === "PRINTING";

  const handlePrint = () => {
    if (busy) return; // double-tap guard (the app has its own lock as well)
    setState("CONNECTING");
    setMessage("Свързване с принтера…");
    const sent = requestOrderPrint(order, { isReprint: printedOnce, template });
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
    ? "Свързване…"
    : state === "ERROR"
      ? `ОПИТАЙ ОТНОВО (${ticketLabel})`
      : printedOnce
        ? `ПРИНТИРАЙ ОТНОВО: ${ticketLabel.toUpperCase()}`
        : `🖨 ${ticketLabel.toUpperCase()}`;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={handlePrint}
        className={`rounded-2xl font-extrabold text-white shadow-md transition disabled:opacity-60 ${
          compact ? "px-4 py-2 text-sm" : "w-full px-6 py-3.5 text-lg sm:w-auto"
        } ${state === "ERROR" ? "bg-red-600 hover:bg-red-700" : "bg-pizza-ink hover:bg-neutral-700"}`}
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

/** Both tickets side by side — the kitchen slip and the delivery slip. */
export function PrintOrderButtons({
  order,
  templates,
  compact = false,
}: {
  order: OrderWithItems;
  templates: PrintTemplateData[];
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {templates.map((template) => (
        <PrintOrderButton
          key={template.id}
          order={order}
          templateId={template.id}
          template={template}
          compact={compact}
        />
      ))}
    </div>
  );
}
