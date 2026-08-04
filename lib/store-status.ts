/**
 * The restaurant's open/closed state — SERVER ONLY.
 *
 * Thin wrapper: it reads the (cached) settings row and hands the decision to
 * the pure resolver in `lib/store-hours.ts`. All the interesting logic lives
 * there, where the smoke suite can test it without a database.
 *
 * The read goes through the same `unstable_cache` entry as the footer, so
 * checking whether the shop is open costs no extra query. That the cache holds
 * `closedUntil` rather than "open"/"closed" is what lets a timed closure end
 * on time despite the cache: the expiry is computed against `now` on every
 * call, so nothing has to be invalidated when the timer runs out. Only an
 * admin ACTION (close/reopen) changes the row, and that calls `revalidateTag`.
 *
 * ⚠️ Never import from a Client Component — it reaches the database. The
 *    browser gets this through `GET /api/store-status` instead.
 */
import { getRestaurantState } from "@/lib/restaurant-settings";
import { resolveStoreStatus } from "@/lib/store-hours";
import type { StoreStatus } from "@/types/store-status";

/**
 * Open or closed right now, with the reason and the reopening time.
 * Never throws — `getRestaurantState` already falls back to the shipped
 * constants, so the worst case is the shop being judged by its default hours.
 */
export async function getStoreStatus(now: Date = new Date()): Promise<StoreStatus> {
  const { settings, closure } = await getRestaurantState();

  return resolveStoreStatus(
    settings.hours,
    {
      active: closure.active,
      until: closure.until ? new Date(closure.until) : null,
    },
    now
  );
}
