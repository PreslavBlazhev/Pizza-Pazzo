"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  getOrderById,
  getOrderStatus,
  setOrderStatus,
  type StatusUpdateExtras,
} from "@/lib/orders";
import { canTransition } from "@/lib/order-status";
import { sendCustomerOrderAcceptedEmail } from "@/lib/email/resend";
import { isOrderStatus } from "@/types/order";
import type { ActionResult } from "@/types/auth";

/** Sanity bounds for the estimated delivery time (minutes). */
const MIN_ESTIMATE = 1;
const MAX_ESTIMATE = 480;
const MAX_NOTE_LENGTH = 500;

/**
 * Admin: change an order's status. Staff and up may do this. The transition is
 * validated against ORDER_STATUS_FLOW so, e.g., a DELIVERED order can't be moved
 * back to PENDING.
 *
 * ACCEPTED requires an estimated delivery time (minutes); CANCELLED may carry a
 * reason (adminNote, shown in the admin only). After the write, ACCEPTED — and
 * only ACCEPTED — triggers a best-effort email to the customer; a failed email
 * never rolls back the status change.
 */
export async function updateOrderStatusAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("orderId") ?? "");
  const next = String(formData.get("status") ?? "");

  if (!id || !isOrderStatus(next)) {
    return { ok: false, error: "Невалиден статус." };
  }

  const current = await getOrderStatus(id);
  if (!current) return { ok: false, error: "Поръчката не беше намерена." };

  if (!canTransition(current, next)) {
    return { ok: false, error: "Недопустима смяна на статус." };
  }

  const extras: StatusUpdateExtras = {};

  if (next === "ACCEPTED") {
    const raw = String(formData.get("estimatedTimeMinutes") ?? "").trim();
    const minutes = Number(raw);
    if (!raw || !Number.isInteger(minutes) || minutes < MIN_ESTIMATE || minutes > MAX_ESTIMATE) {
      return { ok: false, error: "Въведете валидно време в минути (цяло число)." };
    }
    extras.estimatedTimeMinutes = minutes;
  }

  if (next === "ACCEPTED" || next === "CANCELLED") {
    const note = String(formData.get("adminNote") ?? "").trim();
    if (note.length > MAX_NOTE_LENGTH) {
      return { ok: false, error: `Бележката е твърде дълга (до ${MAX_NOTE_LENGTH} знака).` };
    }
    if (note) extras.adminNote = note;
  }

  try {
    await setOrderStatus(id, next, extras);
  } catch {
    return { ok: false, error: "Статусът не можа да бъде обновен." };
  }

  // Status is committed; the customer email is best-effort on top of it. The
  // sender logs and swallows its own failures, so a broken mail setup can't
  // surface an error here or undo the write. ACCEPTED is the only status the
  // customer is ever emailed about, and only if they gave an email address.
  if (next === "ACCEPTED") {
    const order = await getOrderById(id);
    if (order?.items) {
      await sendCustomerOrderAcceptedEmail({ ...order, items: order.items });
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true, message: "Статусът е обновен." };
}
