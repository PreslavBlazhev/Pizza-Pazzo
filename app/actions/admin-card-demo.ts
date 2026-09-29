"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { CARD_DEMO_MODE_LABELS, isCardDemoMode } from "@/lib/payments/demo";
import { getAppEnv } from "@/lib/app-env";
import type { ActionResult } from "@/types/auth";

/**
 * Admin: switch the live-site card DEMO (payment simulator, no real money)
 * OFF / STAFF / EVERYONE. ADMIN and SUPER_ADMIN only — the same people who
 * edit the restaurant settings. Takes effect on the next page load; demo
 * payments already under way are still verified while it is not OFF.
 */
export async function setCardDemoModeAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const mode = String(formData.get("cardDemoMode") ?? "");
  if (!isCardDemoMode(mode)) return { ok: false, error: "Невалиден избор." };
  if (mode === "EVERYONE" && getAppEnv() === "production") {
    return {
      ok: false,
      error:
        "На истинския сайт демото не може да се показва на клиенти — само на служители. Изберете „Само за влезли служители и админи“.",
    };
  }

  await db.restaurantSettings.update({ where: { id: "restaurant" }, data: { cardDemoMode: mode } });
  console.log(`[payments] card demo set to ${mode} by ${user.email}`);

  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  return { ok: true, message: `Демо плащане с карта: ${CARD_DEMO_MODE_LABELS[mode]}.` };
}
