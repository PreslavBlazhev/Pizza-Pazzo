/**
 * Background payment checks inside the web process — SERVER ONLY.
 *
 * Unclear payments must settle even when nobody is looking: the customer
 * closed the browser, NOTIFY never arrived, no kitchen board is open. Every
 * minute (one run at a time, unref'd so it never keeps the process alive):
 *
 *   reconcileOpenPayments   open / timed-out attempts → status query,
 *                           back-off per attempt, UNRESOLVED_PAYMENT after 2 h
 *   verifyUpcDecisions      our NOTIFY answers checked against the bank,
 *                           bounded retries, alerts for staff
 *
 * Both are bounded per run and per attempt, so they cannot hammer the bank.
 * The same functions also run from the live board's poll and from
 * POST /api/payments/reconcile (an external scheduler), so a sleeping or
 * restarted process loses nothing — state lives in the database.
 */
import { reconcileOpenPayments } from "./reconcile";
import { verifyUpcDecisions } from "./upc/verify";

export const BACKGROUND_INTERVAL_MS = 60_000;

let running = false;

export async function runPaymentBackgroundOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await reconcileOpenPayments({ limit: 10 });
    await verifyUpcDecisions({ limit: 10 });
  } catch (err) {
    console.warn(`[payments] background check failed: ${(err as Error).message}`);
  } finally {
    running = false;
  }
}

/** Starts the minute timer once per process; no-op without a payment provider. */
export function startPaymentBackgroundJobs(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!(env.PAYMENT_PROVIDER ?? "").trim()) return false;
  const g = globalThis as { __ppPaymentTimer?: ReturnType<typeof setInterval> };
  if (g.__ppPaymentTimer) return true;
  g.__ppPaymentTimer = setInterval(() => void runPaymentBackgroundOnce(), BACKGROUND_INTERVAL_MS);
  g.__ppPaymentTimer.unref?.();
  return true;
}
