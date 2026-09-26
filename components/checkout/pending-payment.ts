/**
 * Browser-side memory of a card payment in progress — client only.
 *
 * A customer can leave for the bank's page and not come back the normal way:
 * the Android app is killed in the background, the phone restarts, the bank
 * page is closed. The server still settles the payment (the bank's callback
 * does not need the customer), but the customer needs a way back to see the
 * result. This remembers which order was being paid, so every page can show
 * "order №… is waiting for payment — check" until it is settled.
 *
 * Only the order's access token and number are kept — never amounts, card
 * data or personal details. Every read and write is wrapped: private
 * browsing and blocked storage simply mean no reminder, never a crash.
 */

const KEY = "pp-pending-payment";
/** A payment older than this is no longer worth a banner. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PendingPayment {
  token: string;
  orderNumber: number;
  startedAt: number;
}

export function rememberPendingPayment(p: { token: string; orderNumber: number }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, startedAt: Date.now() }));
  } catch {
    /* storage unavailable — no reminder, nothing else changes */
  }
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PendingPayment>;
    if (
      typeof p.token !== "string" ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(p.token) ||
      typeof p.orderNumber !== "number" ||
      typeof p.startedAt !== "number" ||
      Date.now() - p.startedAt > MAX_AGE_MS
    ) {
      localStorage.removeItem(KEY);
      return null;
    }
    return p as PendingPayment;
  } catch {
    return null;
  }
}

/** Forget it — called once the payment is settled (paid) or dismissed. */
export function clearPendingPayment(token?: string): void {
  try {
    if (token) {
      const current = readPendingPayment();
      if (current && current.token !== token) return;
    }
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clean */
  }
}

/** A fresh idempotency key for one checkout (see CheckoutForm). */
export function newCheckoutKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
