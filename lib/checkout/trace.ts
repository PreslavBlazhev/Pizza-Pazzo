/**
 * A trail of one checkout attempt, for the cases the server log cannot show:
 * the browser never sent the order, or left the page before the answer came.
 *
 * Kept in sessionStorage (this tab only) while the attempt runs. When the
 * page is left mid-attempt — or the next checkout page finds an unfinished
 * trail — it is sent ONCE to /api/checkout-trace, which writes one log line.
 *
 * Contents, deliberately minimal: a random id (not the checkout key, not tied
 * to the customer), the stage names with their offsets in ms, the path and
 * the language. No name, phone, e-mail, address, basket, price or token.
 *
 * Pure enough to share: the schema is used by the API route too.
 */
import { z } from "zod";

export const TRACE_STAGES = [
  "click", // the order button was pressed
  "invalid", // the browser found a required field empty — nothing sent
  "sent", // the request to the server started
  "ok", // the server answered: order created (or found)
  "refused", // the server answered: refused (validation, closed, minimum…)
  "failed", // no usable answer (5xx, dropped connection)
  "recovered", // after a failure, the status check found the order
  "confirm", // navigating to the confirmation / payment page
  "left", // the page was left while the attempt was unfinished
] as const;
export type TraceStage = (typeof TRACE_STAGES)[number];

/** Stages after which the attempt is settled — nothing to report. */
const FINAL: readonly TraceStage[] = ["invalid", "refused", "confirm"];

export const traceReportSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]{12}$/),
  path: z.string().regex(/^\/(en\/)?checkout$/),
  locale: z.enum(["bg", "en"]),
  stages: z
    .array(z.strictObject({ s: z.enum(TRACE_STAGES), ms: z.number().int().min(0).max(86_400_000) }))
    .min(1)
    .max(20),
});
export type TraceReport = z.infer<typeof traceReportSchema>;

const KEY = "pp-checkout-trace";

interface Stored {
  id: string;
  t0: number;
  path: string;
  locale: "bg" | "en";
  stages: { s: TraceStage; ms: number }[];
}

function read(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function write(v: Stored | null) {
  try {
    if (v) window.sessionStorage.setItem(KEY, JSON.stringify(v));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: no trail, nothing else changes */
  }
}

function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * Records a stage; "click" starts a new attempt. Settled attempts are dropped.
 * Returns the attempt's id (sent with the order so the server's log line and
 * this trail can be matched), or "" when there is no trail.
 */
export function traceStage(stage: TraceStage, locale: "bg" | "en"): string {
  if (typeof window === "undefined") return "";
  let cur = read();
  if (stage === "click" || !cur) {
    cur = { id: newId(), t0: Date.now(), path: window.location.pathname, locale, stages: [] };
  }
  if (cur.stages.length < 20) cur.stages.push({ s: stage, ms: Math.max(0, Date.now() - cur.t0) });
  write(FINAL.includes(stage) ? null : cur);
  return cur.id;
}

function send(cur: Stored, extra?: TraceStage) {
  const stages = extra && cur.stages.length < 20 ? [...cur.stages, { s: extra, ms: Math.max(0, Date.now() - cur.t0) }] : cur.stages;
  const report: TraceReport = { id: cur.id, path: cur.path, locale: cur.locale, stages };
  if (!traceReportSchema.safeParse(report).success) return;
  const body = JSON.stringify(report);
  try {
    if (!navigator.sendBeacon?.("/api/checkout-trace", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/checkout-trace", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    /* diagnostics never break the page */
  }
}

/**
 * Call once when the checkout page mounts: reports an attempt a previous page
 * left unfinished, and arms a report for this page being left mid-attempt.
 * Returns the cleanup.
 */
export function armCheckoutTrace(): () => void {
  const previous = read();
  if (previous) {
    send(previous);
    write(null);
  }
  const onLeave = () => {
    const cur = read();
    if (!cur) return;
    send(cur, "left");
    write(null);
  };
  // pagehide: a reload or a full-page navigation. The cleanup: a client-side
  // navigation away from the checkout (it unmounts the form, no pagehide).
  window.addEventListener("pagehide", onLeave);
  return () => {
    window.removeEventListener("pagehide", onLeave);
    onLeave();
  };
}
