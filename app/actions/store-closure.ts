"use server";

import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  SETTINGS_CACHE_TAG,
  clearForcedOpening,
  clearManualClosure,
  setForcedOpening,
  setManualClosure,
} from "@/lib/restaurant-settings";
import type { ActionResult } from "@/types/auth";
import { CLOSURE_MAX_MINUTES, CLOSURE_MIN_MINUTES } from "@/types/store-status";

/**
 * Closing and reopening the restaurant ("Затвори заведението"), and forcing it
 * open outside its hours ("Отвори принудително").
 *
 * STAFF+, not ADMIN+: these are shift decisions — the kitchen is swamped, the
 * oven broke, or the other way round, someone is working tonight after all —
 * and the people who make them are the ones standing at the tablet. Every one
 * of them is fully reversible from the same button, so the blast radius of a
 * mistaken press is one tap.
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
  // opening hours it stays closed, and the status will say so — that is what
  // `forceOpenStoreAction` below is for.
  return { ok: true, message: "Заведението е отворено." };
}

/**
 * Forces the restaurant open outside its opening hours — "работим тази вечер,
 * независимо какво пише в графика".
 *
 * Same two modes as closing, and for the same reason: a timed opening lapses
 * on its own so nobody has to remember to stop it, while "до ръчно затваряне"
 * is for a night whose end nobody can predict yet.
 */
export async function forceOpenStoreAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);

  const mode = String(formData.get("mode") ?? "timed");

  if (mode === "indefinite") {
    try {
      await setForcedOpening({ until: null, byEmail: user.email });
    } catch (error) {
      console.error("[closure] indefinite force-open failed:", error);
      return { ok: false, error: "Заведението не можа да бъде отворено. Опитайте отново." };
    }
    revalidateTag(SETTINGS_CACHE_TAG);
    return { ok: true, message: "Заведението приема поръчки до ръчно затваряне." };
  }

  if (mode !== "timed") {
    return { ok: false, error: "Изберете за колко време да отворите заведението." };
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

  // From the server clock, like the closure: a tablet with a wrong date must
  // not be able to leave the shop taking orders until next year.
  const until = new Date(Date.now() + minutes * 60_000);

  try {
    await setForcedOpening({ until, byEmail: user.email });
  } catch (error) {
    console.error("[closure] timed force-open failed:", error);
    return { ok: false, error: "Заведението не можа да бъде отворено. Опитайте отново." };
  }

  revalidateTag(SETTINGS_CACHE_TAG);

  return { ok: true, message: "Заведението приема поръчки." };
}

/** Ends a forced opening: the working hours decide again. */
export async function endForcedOpeningAction(): Promise<ActionResult> {
  await requireRole(["STAFF", "ADMIN", "SUPER_ADMIN"]);

  try {
    await clearForcedOpening();
  } catch (error) {
    console.error("[closure] ending the forced opening failed:", error);
    return { ok: false, error: "Принудителното отваряне не можа да бъде спряно. Опитайте отново." };
  }

  revalidateTag(SETTINGS_CACHE_TAG);

  return { ok: true, message: "Заведението работи по обявеното работно време." };
}
