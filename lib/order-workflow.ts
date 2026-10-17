/**
 * Staff status changes — SERVER ONLY, free of Next request APIs so the tests
 * can drive it directly (app/actions/order-admin.ts adds the role check).
 *
 * Guarantees:
 *   - only transitions allowed for the order's delivery method
 *     (lib/order-status.ts) — a pickup order never goes "В доставка";
 *   - two screens, one order: the write is `UPDATE … WHERE status = <the
 *     status this request read>`. The second tablet's tap finds the order
 *     already moved and is told so instead of overwriting it;
 *   - a repeated request (double tap, network retry) for a step that has
 *     already happened is answered "already done", changes nothing and
 *     queues nothing;
 *   - "Приеми" writes the status AND the customer e-mail's outbox row in ONE
 *     transaction (lib/email/outbox.ts): an accepted order always has its
 *     e-mail queued, and a failing e-mail never undoes the accept;
 *   - an expired order (after 22:30) cannot be found, so it cannot be
 *     changed (lib/db.ts).
 */
import { db } from "@/lib/db";
import { getOrderById, statusTimestamps } from "@/lib/orders";
import { canTransition, statusLabelBg } from "@/lib/order-status";
import { paymentBlocksStatusChange } from "@/lib/payments/status";
import { anonymiseIfPending } from "@/lib/privacy";
import { isTerminalStatus } from "@/lib/order-status";
import { enqueueAcceptedEmail } from "@/lib/email/outbox";
import type { OrderStatus } from "@/types/order";

export const MIN_ESTIMATE = 1;
export const MAX_ESTIMATE = 480;
export const MAX_NOTE_LENGTH = 500;

export interface ChangeStatusInput {
  orderId: string;
  next: OrderStatus;
  /** The status the staff member's screen showed; a mismatch is a conflict. */
  expectedStatus?: OrderStatus | null;
  estimatedTimeMinutes?: number;
  adminNote?: string;
}

export type ChangeStatusResult =
  | { ok: true; changed: boolean; emailQueued: boolean; message: string; status: OrderStatus }
  | { ok: false; error: string; conflict?: boolean; status?: OrderStatus };

class StatusConflict extends Error {}

export async function changeOrderStatus(input: ChangeStatusInput): Promise<ChangeStatusResult> {
  const before = await getOrderById(input.orderId);
  if (!before) {
    return { ok: false, error: "Поръчката не беше намерена — може би вече е изтекла (22:30)." };
  }
  const method = before.deliveryMethod;

  // The step already happened (a double tap, a retry, the other tablet).
  if (before.status === input.next) {
    return {
      ok: true,
      changed: false,
      emailQueued: false,
      status: before.status,
      message: `Поръчката вече е „${statusLabelBg(before.status, method)}“.`,
    };
  }
  if (input.expectedStatus && input.expectedStatus !== before.status) {
    return {
      ok: false,
      conflict: true,
      status: before.status,
      error: `Поръчката вече е променена от друг екран — сега е „${statusLabelBg(before.status, method)}“.`,
    };
  }
  if (!canTransition(before.status, input.next, method)) {
    return { ok: false, status: before.status, error: "Недопустима смяна на статус." };
  }

  // The money gate. A card order the provider has not confirmed was never
  // released to the kitchen and must not be accepted, prepared or delivered —
  // only cancelled (e.g. an abandoned payment).
  if (paymentBlocksStatusChange(before, input.next)) {
    return {
      ok: false,
      status: before.status,
      error:
        "Поръчката чака потвърждение на плащането с карта и не може да бъде приета. Може само да бъде отказана.",
    };
  }

  const data: Record<string, unknown> = { status: input.next, ...statusTimestamps(input.next) };
  if (input.next === "ACCEPTED") {
    const m = input.estimatedTimeMinutes;
    if (m === undefined || !Number.isInteger(m) || m < MIN_ESTIMATE || m > MAX_ESTIMATE) {
      return { ok: false, status: before.status, error: "Въведете валидно време в минути (цяло число)." };
    }
    data.estimatedTimeMinutes = m;
  }
  if (input.adminNote !== undefined && (input.next === "ACCEPTED" || input.next === "CANCELLED")) {
    if (input.adminNote.length > MAX_NOTE_LENGTH) {
      return { ok: false, status: before.status, error: `Бележката е твърде дълга (до ${MAX_NOTE_LENGTH} знака).` };
    }
    if (input.adminNote) data.adminNote = input.adminNote;
  }

  let emailQueued = false;
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: before.id, status: before.status },
        data,
      });
      if (count !== 1) throw new StatusConflict();
      if (input.next === "ACCEPTED" && before.customerEmail) {
        emailQueued = await enqueueAcceptedEmail(tx, before.id);
      }
    });
  } catch (err) {
    if (err instanceof StatusConflict) {
      const now = await getOrderById(before.id);
      if (!now) return { ok: false, error: "Поръчката вече не съществува (изтекла в 22:30)." };
      if (now.status === input.next) {
        return {
          ok: true,
          changed: false,
          emailQueued: false,
          status: now.status,
          message: `Поръчката вече е „${statusLabelBg(now.status, method)}“.`,
        };
      }
      return {
        ok: false,
        conflict: true,
        status: now.status,
        error: `Поръчката вече е променена от друг екран — сега е „${statusLabelBg(now.status, method)}“.`,
      };
    }
    console.error("[orders] status change failed:", (err as Error).message);
    return { ok: false, status: before.status, error: "Статусът не можа да бъде обновен." };
  }

  // The order is closed, so an address nobody will drive to any more has no
  // reason to exist (lib/privacy.ts — only for a deleted account).
  if (isTerminalStatus(input.next)) {
    await anonymiseIfPending(before.id);
  }

  // Cancelling does NOT refund anything — nothing here talks to the bank.
  const message =
    input.next === "CANCELLED" && before.paymentMethod === "CARD_ONLINE" && before.paymentStatus === "PAID"
      ? "Поръчката е отказана. Тя е платена с карта — възстановете сумата ръчно през портала на банката."
      : "Статусът е обновен.";
  return { ok: true, changed: true, emailQueued, status: input.next, message };
}
