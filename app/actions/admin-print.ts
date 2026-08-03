"use server";

import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  PRINT_TEMPLATES_CACHE_TAG,
  resetPrintTemplate,
  updatePrintTemplate,
} from "@/lib/print-templates";
import {
  printTemplateSchema,
  readPrintTemplateFormData,
} from "@/lib/validators/print-template";
import { isPrintTemplateId, type PrintSections } from "@/types/print";
import type { ActionResult } from "@/types/auth";

/**
 * Saves one print template (ADMIN+).
 *
 * The template id comes from the form but is re-checked against the canonical
 * list, so a crafted request cannot create a third row. Everything else goes
 * through zod before it reaches the database.
 */

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export async function updatePrintTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("templateId") ?? "");
  if (!isPrintTemplateId(id)) {
    return { ok: false, error: "Непозната бележка." };
  }

  const parsed = printTemplateSchema.safeParse(readPrintTemplateFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Проверете полетата по-долу.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await updatePrintTemplate({
      id,
      ...parsed.data,
      sections: parsed.data.sections as PrintSections,
    });
  } catch (error) {
    console.error("[print] template save failed:", error);
    return { ok: false, error: "Настройките не можаха да бъдат запазени. Опитайте отново." };
  }

  // Same reasoning as the restaurant settings action: only revalidateTag.
  // revalidatePath("/", "layout") inside an action makes Next answer with
  // x-action-redirect and throws the admin back to the homepage.
  revalidateTag(PRINT_TEMPLATES_CACHE_TAG);

  return { ok: true, message: "Настройките на печата са запазени." };
}

/** Restores one template to the layout the site shipped with (ADMIN+). */
export async function resetPrintTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const id = String(formData.get("templateId") ?? "");
  if (!isPrintTemplateId(id)) {
    return { ok: false, error: "Непозната бележка." };
  }

  try {
    await resetPrintTemplate(id);
  } catch (error) {
    console.error("[print] template reset failed:", error);
    return { ok: false, error: "Настройките не можаха да бъдат върнати. Опитайте отново." };
  }

  revalidateTag(PRINT_TEMPLATES_CACHE_TAG);

  return { ok: true, message: "Настройките са върнати към фабричните." };
}
