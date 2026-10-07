/**
 * A small fixed-window rate limiter — SERVER ONLY, in memory.
 *
 * Enough for this deployment: ONE Render web service process (SQLite on its
 * disk rules out a second instance anyway). If the site ever runs more than
 * one process, this must move to shared storage — each process would
 * otherwise allow the limit on its own.
 *
 * It protects the payment endpoints from being used as a hammer against the
 * bank (session creation, status queries); it is not an authentication.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 20_000;

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export function rateLimit(key: string, rule: RateLimitRule, now: number = Date.now()): boolean {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) prune(now);
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  if (current.count >= rule.limit) return false;
  current.count++;
  return true;
}

function prune(now: number): void {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  // Still full of live keys (an attack from many addresses): start over
  // rather than grow without bound. Worst case a few requests slip through.
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * The client's address as Render's proxy reports it (the first entry of
 * X-Forwarded-For). Only used as a rate-limit key, never for authorization.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

export const PAYMENT_RATE_LIMITS = {
  /** "Pay" clicks per address — a family on one Wi-Fi still fits. */
  startPerIp: { limit: 20, windowMs: 60_000 },
  /** "Pay" clicks per order. */
  startPerOrder: { limit: 8, windowMs: 60_000 },
  /** Status polls per address (a page polls every 2 s ≈ 30/min). */
  statusPerIp: { limit: 120, windowMs: 60_000 },
  /** The scheduler's reconcile calls per address. */
  reconcilePerIp: { limit: 6, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;
