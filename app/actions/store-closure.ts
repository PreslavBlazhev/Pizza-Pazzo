"use server";

import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  SETTINGS_CACHE_TAG,
  clearManualClosure,
  setManualClosure,
} from "@/lib/restaurant-settings";
import type { ActionResult } from "@/types/auth";
import { CLOSURE_MAX_MINUTES, CLOSURE_MIN_MINUTES } from "@/types/store-status";

/**
 * Closing and reopening the restaurant ("Затвори заведението").
 *
 * STAFF+, not ADMIN+: this is a shift decision — the kitchen is swamped, the
 * oven broke, the delivery driver left — and the people who make it are the
 * ones standing at the tablet. It is fully reversible from the same button, so
 * the blast radius of a mistaken press is one tap.
 */

export async function closeStoreAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);

  // Only the indefinite button carries a `mode`; the duration buttons carry a
  // `minutes` value instead, because one submit button can only contribute one
  // name/value pair to the form data.
  const mode = String(formData.get("mode") ?? "timed");

  if (mode === "indefinite") {
    try {
      await setManualClosure({ until: null, byEmail: user.email });
    } catch (error) {
      console.error("[closure] indefinite close failed:", error);
      return { ok: false, error: "Заведението не можа да бъде затворено. Опитайте отново." };
    }
    revalidateTag(SETTINGS_CACHE_TAG);
    return { ok: true, message: "Заведението е затворено до ръчно отваряне." };
  }

  if (mode !== "timed") {
    return { ok: false, error: "Изберете за колко време да затворите заведението." };
  }

  const minutes = Number(formData.get("minutes"));
  if (
    !Number.isFinite(minutes) ||
    !Number.isInteger(minutes) ||
    minutes < CLOSURE_MIN_MINUTES ||
    minutes > CLOSURE_MAX_MINUTES
  ) {
    return {
      ok: false,
      error: `Въведете време между ${CLOSURE_MIN_MINUTES} и ${CLOSURE_MAX_MINUTES} минути.`,
      fieldErrors: { minutes: "Невалидно време." },
    };
  }

  // The deadline is computed here, from the server clock — a tablet with a
  // wrong date must not be able to close the shop until next year.
  const until = new Date(Date.now() + minutes * 60_000);

  try {
    await setManualClosure({ until, byEmail: user.email });
  } catch (error) {
    console.error("[closure] timed close failed:", error);
    return { ok: false, error: "Заведението не можа да бъде затворено. Опитайте отново." };
  }

  // Only the tag: `revalidatePath("/", "layout")` inside an action makes Next
  // answer with `x-action-redirect: /` and throws the admin out to the
  // homepage (learned the hard way in the settings form). Every consumer reads
  // through the tagged cache entry anyway.
  revalidateTag(SETTINGS_CACHE_TAG);

  return { ok: true, message: "Заведението е затворено." };
}

/** Reopens the restaurant — the manual "започни смяната" for an indefinite closure. */
export async function openStoreAction(): Promise<ActionResult> {
  await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);

  try {
    await clearManualClosure();
  } catch (error) {
    console.error("[closure] reopen failed:", error);
    return { ok: false, error: "Заведението не можа да бъде отворено. Опитайте отново." };
  }

  revalidateTag(SETTINGS_CACHE_TAG);

  // Note: this clears the MANUAL closure only. If the shop is outside its
  // opening hours it stays closed, and the status will say so.
  return { ok: true, message: "Заведението е отворено." };
}
