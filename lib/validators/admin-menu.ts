import { z } from "zod";
import { ALLERGEN_IDS } from "@/lib/allergens";

/**
 * Validation for the admin menu editors (zod v4, Bulgarian messages — the
 * admin is deliberately BG-only). Runs on the server inside the actions in
 * `app/actions/admin-menu.ts`.
 *
 * Prices arrive as text; `priceField` accepts a comma decimal ("13,01") since
 * that is how Bulgarian staff type prices, and normalizes to a number with at
 * most 2 decimals.
 */

const priceField = z
  .string()
  .trim()
  .min(1, "Въведете цена.")
  .transform((v) => Number(v.replace(",", ".")))
  .refine((n) => Number.isFinite(n) && n > 0, "Цената трябва да е положително число.")
  .refine((n) => n < 10000, "Цената е неправдоподобно висока.")
  .transform((n) => Math.round(n * 100) / 100);

/** Optional short text: empty string → "" (kept, the UI falls back to BG). */
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} е твърде дълго (до ${max} знака).`);

export const productUpdateSchema = z.object({
  nameBg: z.string().trim().min(2, "Името (BG) трябва да е поне 2 символа.").max(120, "Името (BG) е твърде дълго."),
  nameEn: optionalText(120, "Името (EN)"),
  descriptionBg: optionalText(600, "Описанието (BG)"),
  descriptionEn: optionalText(600, "Описанието (EN)"),
  categoryId: z.string().trim().min(1, "Изберете категория."),
  priceEur: priceField,
  imageUrl: z
    .string()
    .trim()
    .max(300, "Пътят до снимката е твърде дълъг.")
    .refine(
      (v) => v === "" || v.startsWith("/") || v.startsWith("http"),
      "Пътят до снимката трябва да започва с / или http."
    ),
  sizeBg: optionalText(60, "Грамажът (BG)"),
  sizeEn: optionalText(60, "Грамажът (EN)"),
  sortOrder: z
    .string()
    .trim()
    .transform((v) => Number(v || "0"))
    .refine((n) => Number.isInteger(n) && n >= 0 && n < 10000, "Редът трябва да е цяло неотрицателно число."),
  isAvailable: z.boolean(),
  isPopular: z.boolean(),
  isNew: z.boolean(),
  allergens: z.array(z.enum(ALLERGEN_IDS, { error: "Непознат алерген." })),
  allergensUnverified: z.boolean(),
});

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const variantUpdateSchema = z.object({
  nameBg: z.string().trim().min(1, "Името (BG) на варианта е задължително.").max(60, "Името (BG) на варианта е твърде дълго."),
  nameEn: optionalText(60, "Името (EN) на варианта"),
  priceEur: priceField,
});

export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;

export const categoryUpdateSchema = z.object({
  nameBg: z.string().trim().min(2, "Името (BG) трябва да е поне 2 символа.").max(80, "Името (BG) е твърде дълго."),
  nameEn: optionalText(80, "Името (EN)"),
  icon: optionalText(8, "Иконата"),
  sortOrder: z
    .string()
    .trim()
    .transform((v) => Number(v || "0"))
    .refine((n) => Number.isInteger(n) && n >= 0 && n < 10000, "Редът трябва да е цяло неотрицателно число."),
  isActive: z.boolean(),
});

export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
