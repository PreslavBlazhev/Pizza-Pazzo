/**
 * Print template data access — SERVER ONLY.
 *
 * Mirrors lib/restaurant-settings.ts: one `unstable_cache` entry tagged
 * PRINT_TEMPLATES_CACHE_TAG, a read that never throws, and factory defaults
 * (types/print.ts) as the fallback — a database hiccup must degrade a ticket to
 * its shipped layout, never stop the kitchen from printing.
 *
 * ⚠️ Never import from a Client Component — it reaches the database. The
 *    pure builder in lib/printer/ticket-template.ts is the client-safe half.
 */
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  MAX_PRINT_FONT_PT,
  MAX_PRINT_SCALE,
  MIN_PRINT_FONT_PT,
  MIN_PRINT_SCALE,
  PRINT_ALIGNMENTS,
  PRINT_SECTIONS,
  PRINT_TEMPLATE_IDS,
  defaultPrintTemplate,
  isPrintTemplateId,
  type PrintAlign,
  type PrintSectionId,
  type PrintSectionStyle,
  type PrintSections,
  type PrintTemplateData,
  type PrintTemplateId,
} from "@/types/print";

/** Invalidated by the admin print-settings save. */
export const PRINT_TEMPLATES_CACHE_TAG = "print-templates";

/** Upper bound on staleness if a revalidateTag call is ever missed. */
const PRINT_TEMPLATES_REVALIDATE_SECONDS = 300;

type TemplateRow = Prisma.PrintTemplateGetPayload<Record<string, never>>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merges one stored section object over its default. Every field is validated
 * independently, so a partially corrupted entry keeps whatever it got right
 * and falls back only on the fields it got wrong.
 */
function mergeSection(fallback: PrintSectionStyle, stored: unknown): PrintSectionStyle {
  if (!isRecord(stored)) return fallback;

  const fontPt =
    typeof stored.fontPt === "number" && Number.isFinite(stored.fontPt)
      ? clamp(stored.fontPt, MIN_PRINT_FONT_PT, MAX_PRINT_FONT_PT)
      : fallback.fontPt;

  const scale =
    typeof stored.scale === "number" && Number.isInteger(stored.scale)
      ? clamp(stored.scale, MIN_PRINT_SCALE, MAX_PRINT_SCALE)
      : fallback.scale;

  const align =
    typeof stored.align === "string" &&
    (PRINT_ALIGNMENTS as readonly string[]).includes(stored.align)
      ? (stored.align as PrintAlign)
      : fallback.align;

  return {
    visible: typeof stored.visible === "boolean" ? stored.visible : fallback.visible,
    fontPt,
    scale,
    align,
    bold: typeof stored.bold === "boolean" ? stored.bold : fallback.bold,
  };
}

/**
 * Parses `sectionsJson` over the template's defaults. Never throws: invalid
 * JSON, a non-object root and unknown keys all resolve to the defaults, and a
 * section added to the registry after this row was written simply appears with
 * its default style.
 */
export function parseSections(json: string | null | undefined, id: PrintTemplateId): PrintSections {
  const defaults = defaultPrintTemplate(id).sections;
  let stored: unknown;
  try {
    stored = json ? JSON.parse(json) : null;
  } catch {
    return defaults;
  }
  if (!isRecord(stored)) return defaults;

  return Object.fromEntries(
    PRINT_SECTIONS.map((section) => [
      section.id,
      mergeSection(defaults[section.id as PrintSectionId], stored[section.id]),
    ])
  ) as PrintSections;
}

/** Prisma row → the plain domain shape. */
function mapTemplate(row: TemplateRow): PrintTemplateData {
  const id = isPrintTemplateId(row.id) ? row.id : "KITCHEN";
  const defaults = defaultPrintTemplate(id);
  return {
    id,
    name: row.name || defaults.name,
    paperWidthMm: row.paperWidthMm,
    charsPerLine: row.charsPerLine,
    marginMm: row.marginMm,
    lineHeight: row.lineHeight,
    headerText: row.headerText,
    footerText: row.footerText,
    showDividers: row.showDividers,
    feedLinesAfter: row.feedLinesAfter,
    autoCut: row.autoCut,
    copies: row.copies,
    sections: parseSections(row.sectionsJson, id),
  };
}

const loadTemplates = unstable_cache(
  async (): Promise<PrintTemplateData[]> => {
    const rows = await db.printTemplate.findMany();
    const byId = new Map(rows.map((row) => [row.id, row]));
    // Always return both templates in a stable order, seeding any that the
    // migration has not created yet from the defaults. A GET stays read-only.
    return PRINT_TEMPLATE_IDS.map((id) => {
      const row = byId.get(id);
      return row ? mapTemplate(row) : defaultPrintTemplate(id);
    });
  },
  ["print-templates"],
  { tags: [PRINT_TEMPLATES_CACHE_TAG], revalidate: PRINT_TEMPLATES_REVALIDATE_SECONDS }
);

/** Both templates, KITCHEN first. Never throws. */
export async function getPrintTemplates(): Promise<PrintTemplateData[]> {
  try {
    return await loadTemplates();
  } catch (error) {
    console.error("[print] templates read failed, using defaults:", error);
    return PRINT_TEMPLATE_IDS.map(defaultPrintTemplate);
  }
}

/** One template by id. Never throws. */
export async function getPrintTemplate(id: PrintTemplateId): Promise<PrintTemplateData> {
  const all = await getPrintTemplates();
  return all.find((t) => t.id === id) ?? defaultPrintTemplate(id);
}

/**
 * Writes one template (create-or-update, so a missing row recovers instead of
 * erroring). Callers must validate first — see lib/validators/print-template.ts.
 */
export async function updatePrintTemplate(data: PrintTemplateData): Promise<void> {
  const values = {
    name: data.name,
    paperWidthMm: data.paperWidthMm,
    charsPerLine: data.charsPerLine,
    marginMm: data.marginMm,
    lineHeight: data.lineHeight,
    headerText: data.headerText,
    footerText: data.footerText,
    showDividers: data.showDividers,
    feedLinesAfter: data.feedLinesAfter,
    autoCut: data.autoCut,
    copies: data.copies,
    sectionsJson: JSON.stringify(data.sections),
  } satisfies Omit<Prisma.PrintTemplateUncheckedCreateInput, "id">;

  await db.printTemplate.upsert({
    where: { id: data.id },
    create: { ...values, id: data.id },
    update: values,
  });
}

/** Restores one template to its shipped layout. */
export async function resetPrintTemplate(id: PrintTemplateId): Promise<void> {
  await updatePrintTemplate(defaultPrintTemplate(id));
}
