"use server";

import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  SETTINGS_CACHE_TAG,
  updateRestaurantSettings,
} from "@/lib/restaurant-settings";
import {
  readSettingsFormData,
  restaurantSettingsSchema,
} from "@/lib/validators/settings";
import { WEEKDAYS, type RestaurantHours } from "@/types/settings";
import type { ActionResult } from "@/types/auth";

/**
 * Saves the restaurant's contact details and opening hours (ADMIN+).
 *
 * One validated, atomic upsert against the single canonical row — no partial
 * writes, and the id is fixed server-side so a crafted form cannot create
 * extra settings records. Nothing operational is touched here: the Resend
 * sender/recipient, delivery fee and payment settings all stay where they are.
 */

/** Flattens zod issues into `field` / `hours.monday.from` style keys. */
function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export async function updateRestaurantSettingsAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const parsed = restaurantSettingsSchema.safeParse(readSettingsFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Проверете полетата по-долу.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const data = parsed.data;
  const hours = Object.fromEntries(
    WEEKDAYS.map((day) => {
      const value = data.hours[day];
      return [
        day,
        value.open
          ? { open: true, from: value.from ?? null, to: value.to ?? null }
          : { open: false, from: null, to: null },
      ];
    })
  ) as RestaurantHours;

  try {
    await updateRestaurantSettings({
      addressBg: data.addressBg,
      addressEn: data.addressEn,
      primaryPhone: data.primaryPhone,
      secondaryPhone: data.secondaryPhone,
      contactEmail: data.contactEmail,
      hours,
    });
  } catch (error) {
    console.error("[settings] save failed:", error);
    return { ok: false, error: "Настройките не можаха да бъдат запазени. Опитайте отново." };
  }

  // Tag invalidation is the whole story: the footer, the contacts page, the
  // legal pages and the JSON-LD all read through the cache entry tagged
  // SETTINGS_CACHE_TAG, so dropping that tag re-renders every one of them.
  //
  // Deliberately NOT `revalidatePath("/", "layout")` — from inside an action
  // that makes Next answer with `x-action-redirect: /`, which threw the admin
  // out to the homepage instead of showing the success message (observed while
  // building this). The tag already covers those pages.
  revalidateTag(SETTINGS_CACHE_TAG);

  return { ok: true, message: "Настройките са запазени." };
}
