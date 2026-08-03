import { z } from "zod";
import {
  MAX_PRINT_FONT_PT,
  MAX_PRINT_SCALE,
  MIN_PRINT_FONT_PT,
  MIN_PRINT_SCALE,
  PAPER_WIDTHS_MM,
  PRINT_ALIGNMENTS,
  PRINT_SECTIONS,
  type PrintSectionId,
} from "@/types/print";

/**
 * Print template validation (zod v4). Runs on the server before anything is
 * written — the admin form is convenient, not trusted.
 *
 * Messages are in Bulgarian: the admin panel is staff-facing and BG-only.
 *
 * The template id is NOT part of this schema. It comes from the route and is
 * re-checked against PRINT_TEMPLATE_IDS in the action, so a crafted form
 * cannot create a third template row.
 */

/** Accepts "12" and "12,5" alike — the panel is Bulgarian, commas happen. */
const decimalField = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .refine((n) => Number.isFinite(n), `${label}: въведете число.`)
    .refine((n) => n >= min && n <= max, `${label}: стойността трябва да е между ${min} и ${max}.`);

const intField = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .refine((n) => Number.isFinite(n), `${label}: въведете число.`)
    .transform((n) => Math.round(n))
    .refine((n) => n >= min && n <= max, `${label}: стойността трябва да е между ${min} и ${max}.`);

const sectionSchema = z.object({
  visible: z.boolean(),
  fontPt: decimalField(MIN_PRINT_FONT_PT, MAX_PRINT_FONT_PT, "Размер (pt)"),
  scale: intField(MIN_PRINT_SCALE, MAX_PRINT_SCALE, "Термо размер"),
  align: z.enum(PRINT_ALIGNMENTS, { error: "Непозната позиция." }),
  bold: z.boolean(),
});

/** Every section must be present — the form always submits the full set. */
const sectionsSchema = z.object(
  Object.fromEntries(PRINT_SECTIONS.map((s) => [s.id, sectionSchema])) as Record<
    PrintSectionId,
    typeof sectionSchema
  >
);

export const printTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Името на бележката е задължително.")
    .max(40, "Името на бележката е твърде дълго (до 40 знака)."),
  paperWidthMm: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine(
      (n) => (PAPER_WIDTHS_MM as readonly number[]).includes(n),
      "Ширината трябва да е 58 или 80 mm."
    ),
  charsPerLine: intField(20, 96, "Символи на ред"),
  marginMm: decimalField(0, 20, "Поле"),
  lineHeight: decimalField(0.8, 3, "Разстояние между редовете"),
  headerText: z.string().trim().max(60, "Заглавието е твърде дълго (до 60 знака)."),
  footerText: z.string().trim().max(200, "Долният текст е твърде дълъг (до 200 знака)."),
  showDividers: z.boolean(),
  feedLinesAfter: intField(0, 20, "Празни редове след бележката"),
  autoCut: z.boolean(),
  copies: intField(1, 5, "Брой копия"),
  sections: sectionsSchema,
});

export type PrintTemplateInput = z.infer<typeof printTemplateSchema>;

/**
 * FormData → the shape the schema expects.
 *
 * Section fields are flat and prefixed (`section.items.fontPt`) because that is
 * what plain HTML inputs can produce without JavaScript. Checkboxes are absent
 * from FormData when unchecked, which is exactly the "false" case.
 */
export function readPrintTemplateFormData(formData: FormData) {
  const text = (key: string) => String(formData.get(key) ?? "");
  const checked = (key: string) => formData.get(key) !== null;

  return {
    name: text("name"),
    paperWidthMm: text("paperWidthMm"),
    charsPerLine: text("charsPerLine"),
    marginMm: text("marginMm"),
    lineHeight: text("lineHeight"),
    headerText: text("headerText"),
    footerText: text("footerText"),
    showDividers: checked("showDividers"),
    feedLinesAfter: text("feedLinesAfter"),
    autoCut: checked("autoCut"),
    copies: text("copies"),
    sections: Object.fromEntries(
      PRINT_SECTIONS.map((s) => [
        s.id,
        {
          visible: checked(`section.${s.id}.visible`),
          fontPt: text(`section.${s.id}.fontPt`),
          scale: text(`section.${s.id}.scale`),
          align: text(`section.${s.id}.align`),
          bold: checked(`section.${s.id}.bold`),
        },
      ])
    ),
  };
}
