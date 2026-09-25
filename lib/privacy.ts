import { db } from "@/lib/db";
import { isTerminalStatus } from "@/lib/order-status";

/**
 * What happens to a customer's data in past orders when they delete their
 * account.
 *
 * An order is two things at once. It is an accounting record — a number, a
 * date, a list of items and the sums the restaurant declares — and the law
 * says that part is kept. It is also a name, a phone number and the address
 * of somebody's flat, and none of that is accounting: the restaurant can
 * account for a delivered pizza perfectly well without knowing who ate it.
 *
 * So deleting an account scrubs the second half and keeps the first. The
 * privacy policy has always said this; until now only the `userId` link was
 * actually removed, which left every order holding the name, e-mail, phone and
 * address of a customer who had asked to be forgotten.
 *
 * One order cannot be scrubbed immediately: the one still being cooked or
 * driven. Its address is the only way to finish delivering it, and a delivery
 * the customer already paid for is a contract, not surveillance. Those are
 * marked [anonymizePending] and scrubbed the moment they reach DELIVERED or
 * CANCELLED — see `setOrderStatus` in lib/orders.ts.
 */

/**
 * The values written over the personal fields.
 *
 * The name carries a readable marker rather than an empty string because it is
 * the one field the admin always shows: staff looking at an old order should
 * see *why* there is no customer on it, not a blank where a name used to be.
 * Everything else is emptied outright — a placeholder in a phone field is a
 * value somebody will eventually try to dial.
 *
 * `deliveryCity` is deliberately left alone. It is one of two values for the
 * whole restaurant, it identifies nobody, and the reports group delivered
 * orders by it.
 */
export const ANONYMISED_ORDER = {
  customerName: "Изтрит профил",
  customerEmail: "",
  customerPhone: "",
  deliveryAddress: "",
  deliveryNote: null,
} as const;

/** True when the order's personal fields have already been scrubbed. */
export function isAnonymised(order: { anonymizedAt: Date | null }): boolean {
  return order.anonymizedAt !== null;
}

/**
 * Scrubs every order of [userId] that is safe to scrub, and marks the rest for
 * scrubbing when they finish.
 *
 * Called from `deleteOwnAccount` *before* the User row goes, because after the
 * delete the orders are indistinguishable from a guest's — `userId` is set to
 * NULL by the database and nothing links them back.
 *
 * Returns what it did, so the caller can log or test it.
 */
export async function anonymiseOrdersOfUser(
  userId: string,
): Promise<{ scrubbed: number; deferred: number }> {
  const orders = await db.order.findMany({
    where: { userId, anonymizedAt: null },
    select: { id: true, status: true },
  });

  const finished = orders.filter((o) => isTerminalStatus(o.status));
  const inProgress = orders.filter((o) => !isTerminalStatus(o.status));

  const now = new Date();

  const [{ count: scrubbed }, { count: deferred }] = await db.$transaction([
    db.order.updateMany({
      where: { id: { in: finished.map((o) => o.id) } },
      data: { ...ANONYMISED_ORDER, anonymizedAt: now, anonymizePending: false },
    }),
    db.order.updateMany({
      where: { id: { in: inProgress.map((o) => o.id) } },
      data: { anonymizePending: true },
    }),
  ]);

  return { scrubbed, deferred };
}

/**
 * Scrubs one order that was waiting for its delivery to end.
 *
 * Safe to call on any order: it does nothing unless the order is actually
 * flagged and not already scrubbed, and it is written as a conditional
 * `updateMany` so two staff members closing the same order at the same moment
 * cannot scrub it twice.
 */
export async function anonymiseIfPending(orderId: string): Promise<boolean> {
  const { count } = await db.order.updateMany({
    where: { id: orderId, anonymizePending: true, anonymizedAt: null },
    data: { ...ANONYMISED_ORDER, anonymizedAt: new Date(), anonymizePending: false },
  });
  return count > 0;
}
