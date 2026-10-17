"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { changeOrderStatus } from "@/lib/order-workflow";
import { drainEmailOutbox } from "@/lib/email/outbox";
import { isOrderStatus } from "@/types/order";
import type { ActionResult } from "@/types/auth";

/**
 * Admin: change an order's status. Staff and up may do this. Everything else
 * — allowed transitions per delivery method, the two-screens conflict check,
 * the money gate, the estimate, and queuing the customer e-mail in the same
 * transaction — lives in lib/order-workflow.ts.
 *
 * Form fields: orderId, status (the next one), fromStatus (what the screen
 * showed — optional for older screens), estimatedTimeMinutes (ACCEPTED),
 * adminNote (ACCEPTED / CANCELLED).
 *
 * The e-mail goes out AFTER the response (Next `after()`), so a slow or broken
 * mail provider never delays or fails "Приеми"; if this process dies first,
 * the kitchen poll / maintenance job delivers it from the outbox.
 */
export async function updateOrderStatusAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("orderId") ?? "");
  const next = String(formData.get("status") ?? "");
  const from = String(formData.get("fromStatus") ?? "");

  if (!id || !isOrderStatus(next)) {
    return { ok: false, error: "Невалиден статус." };
  }

  const rawMinutes = String(formData.get("estimatedTimeMinutes") ?? "").trim();
  const result = await changeOrderStatus({
    orderId: id,
    next,
    expectedStatus: isOrderStatus(from) ? from : null,
    estimatedTimeMinutes: rawMinutes ? Number(rawMinutes) : undefined,
    adminNote:
      formData.get("adminNote") === null ? undefined : String(formData.get("adminNote") ?? "").trim(),
  });

  if (!result.ok) return { ok: false, error: result.error };

  if (result.emailQueued) {
    after(async () => {
      await drainEmailOutbox({ orderId: id, limit: 1 });
    });
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true, message: result.message };
}
