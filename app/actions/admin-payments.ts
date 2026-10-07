"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { refreshOrderPayment } from "@/lib/payments/service";
import type { ActionResult } from "@/types/auth";
import { toMinorUnits } from "@/lib/payments/money";
import {
  acknowledgePaymentAlert,
  recordBankRefund,
  releaseHeldPaidOrder,
  type StaffActor,
} from "@/lib/payments/staff";

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

function actorOf(user: { id: string; email: string; role: string }): StaffActor {
  return { id: user.id, email: user.email, role: user.role };
}

function revalidateOrder(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

/**
 * Staff decided that a held, bank-confirmed card order should be cooked
 * (late confirmation: the customer still wants it). Never available for an
 * unpaid or cancelled order — see releaseHeldPaidOrder.
 */
export async function releaseHeldPaidOrderAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Липсва поръчка." };
  const r = await releaseHeldPaidOrder(orderId, actorOf(user));
  revalidateOrder(orderId);
  return r.ok ? { ok: true, message: "Поръчката е пусната към кухнята." } : { ok: false, error: r.error };
}

export async function acknowledgePaymentAlertAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Липсва поръчка." };
  const r = await acknowledgePaymentAlert(orderId, actorOf(user));
  revalidateOrder(orderId);
  return r.ok ? { ok: true, message: "Сигналът е отбелязан като прегледан." } : { ok: false, error: r.error };
}

/**
 * Records a refund ALREADY MADE in the bank's admin panel. Admins only — it
 * is a statement about money. Moves nothing by itself.
 */
export async function recordBankRefundAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const orderId = String(formData.get("orderId") ?? "");
  const amountText = String(formData.get("amountEur") ?? "").trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(amountText)) {
    return { ok: false, error: "Въведете сума в евро, напр. 12.50." };
  }
  const r = await recordBankRefund(
    {
      orderId,
      attemptId: String(formData.get("attemptId") ?? ""),
      amountMinor: toMinorUnits(amountText),
      kind: formData.get("kind") === "REVERSAL" ? "REVERSAL" : "REFUND",
      bankReference: String(formData.get("bankReference") ?? ""),
      note: String(formData.get("note") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    },
    actorOf(user)
  );
  revalidateOrder(orderId);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    message: r.duplicate
      ? "Това възстановяване вече е записано (повторно изпращане на формата)."
      : "Възстановяването е отразено. Сумата е върната от банката по картата, с която е платено.",
  };
}
