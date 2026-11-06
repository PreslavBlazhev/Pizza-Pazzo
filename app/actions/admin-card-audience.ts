"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import { SETTINGS_CACHE_TAG } from "@/lib/restaurant-settings";
import { setStoredProductionAudience } from "@/lib/payments/production-audience";
import { loadPaymentConfig } from "@/lib/payments/providers";
import type { ActionResult } from "@/types/auth";

/**
 * Admin: "Реално плащане с карта — достъпно за всички клиенти" — who is
 * offered REAL card payment through the bank's production terminal (on =
 * everyone, off = signed-in staff only). ADMIN and SUPER_ADMIN only, the
 * same people who edit the restaurant settings.
 *
 * Stored in the database; it REPLACES the server's PAYMENT_PRODUCTION_AUDIENCE
 * (lib/payments/production-audience.ts), survives restarts and redeploys,
 * and changes nothing else: terminal, keys, currency and the verification of
 * the bank's confirmations stay the server's. The answer reports what the
 * site now ACTUALLY does, read back after the save — never just the wish.
 */
export async function setCardProductionAudienceAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  if (String(formData.get("intent") ?? "") !== "card-audience") {
    return { ok: false, error: "Невалидна заявка." };
  }
  const audience = formData.get("publicCard") === "on" ? "everyone" : "staff";

  try {
    await setStoredProductionAudience(audience);
  } catch (error) {
    console.error("[payments] card audience save failed:", error);
    return { ok: false, error: "Настройката не можа да бъде запазена. Опитайте отново." };
  }
  console.log(`[payments] real card payment audience set to ${audience} by ${user.email}`);

  // The footer and legal pages read through the settings cache tag;
  // checkout is per-request. (No revalidatePath("/", "layout") — see
  // admin-settings.ts: inside an action it redirects the admin to "/".)
  updateTag(SETTINGS_CACHE_TAG);
  revalidatePath("/admin/settings");

  const c = await loadPaymentConfig(process.env, { fresh: true });
  if (!c.enabled || c.environment !== "production") {
    return {
      ok: true,
      message:
        "Запазено, но реалното банково плащане не е активно на сървъра (виж проблемите по-горе) — картата не се предлага на никого.",
    };
  }
  return {
    ok: true,
    message:
      c.audience === "everyone"
        ? "Запазено: реалното плащане с карта чрез ОББ е достъпно за всички клиенти."
        : "Запазено: реалното плащане с карта се предлага само на влезлия персонал.",
  };
}
