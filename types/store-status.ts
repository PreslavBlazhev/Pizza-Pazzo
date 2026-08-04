/**
 * Whether the restaurant is currently taking orders — the shape shared by the
 * public API route, the customer-facing dialog and the live board.
 *
 * Everything here is plain and serializable (instants are ISO strings, never
 * `Date`): it crosses `unstable_cache`, a JSON route handler and the
 * server→client boundary, and each of those would mangle a `Date`.
 */

/** Why the shop is not taking orders. */
export const CLOSED_REASONS = [
  /** Staff closed it for a set time; it reopens on its own. */
  "manual_timed",
  /** Staff closed it until someone reopens by hand (for the evening / days). */
  "manual_indefinite",
  /** Simply outside the opening hours. */
  "hours",
] as const;

export type ClosedReason = (typeof CLOSED_REASONS)[number];

export interface StoreStatus {
  /** The single gate: false means no new orders, whatever the reason. */
  isOpen: boolean;
  /** Null exactly when `isOpen` is true. */
  reason: ClosedReason | null;
  /**
   * ISO instant at which ordering resumes. Null when that is not knowable —
   * an indefinite closure, or a week with no open day at all.
   *
   * For a timed closure this is NOT always `closedUntil`: if the timer runs
   * out after the kitchen has already closed for the night, this is the next
   * opening instead, because that is when orders really start again.
   */
  reopensAt: string | null;
  /** True when only a human pressing "Отвори заведението" ends the closure. */
  needsManualReopen: boolean;
  /** Server clock, so the countdown never trusts the visitor's device. */
  serverTime: string;
}

/**
 * Bounds on a timed closure, in minutes. Anything longer than a day is what
 * the indefinite mode is for — a "pause" that outlives the shift should end by
 * someone deciding to reopen, not by a timer firing overnight.
 *
 * They live here rather than in the server action because a `"use server"`
 * module may only export async functions, and both the form and the action
 * need to agree on the same numbers.
 */
export const CLOSURE_MIN_MINUTES = 5;
export const CLOSURE_MAX_MINUTES = 1440;

/** The quick-choice buttons in the closing dialog, in order. */
export const CLOSURE_PRESET_MINUTES = [30, 60, 120, 180] as const;

/** The stored manual-closure state, as the admin panel sees it. */
export interface ManualClosure {
  active: boolean;
  /** ISO instant, or null for "until reopened by hand". */
  until: string | null;
  closedAt: string | null;
  closedByEmail: string | null;
}
