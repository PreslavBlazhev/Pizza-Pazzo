"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { refreshOrderPayment } from "@/lib/payments/service";
import type { ActionResult } from "@/types/auth";

/**
 * Admin: ask the payment provider about an order's card payment right now.
 *
 * Read-only towards the money — it runs exactly the same server-to-server
 * verification as the customer's return page and the provider's callback, so
 * staff can never mark anything paid by hand; they can only make the system
 * look again (e.g. when a customer calls to say they did pay).
 */
export async function recheckOrderPaymentAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Липсва поръчка." };

  try {
    await refreshOrderPayment(orderId, { minIntervalMs: 0 });
  } catch (err) {
    console.error("[payments] admin recheck failed:", (err as Error).message);
    return { ok: false, error: "Проверката при доставчика не успя. Опитайте отново след малко." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, message: "Статусът на плащането е проверен при доставчика." };
}
