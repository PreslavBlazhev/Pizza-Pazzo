"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getOrderStatus, setOrderStatus } from "@/lib/orders";
import { canTransition } from "@/lib/order-status";
import { isOrderStatus } from "@/types/order";
import type { ActionResult } from "@/types/auth";

/**
 * Admin: change an order's status. Staff and up may do this. The transition is
 * validated against ORDER_STATUS_FLOW so, e.g., a DELIVERED order can't be moved
 * back to PENDING.
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

  try {
    await setOrderStatus(id, next);
  } catch {
    return { ok: false, error: "Статусът не можа да бъде обновен." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true, message: "Статусът е обновен." };
}
