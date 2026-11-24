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

/**
 * The product's "Базова цена" is FREE TEXT (owner request 24.11.2026): staff
 * may type "7.50/12.00" or anything else. A plain number is stored exactly as
 * before (priceLabel = null). Any other text is kept verbatim as priceLabel
 * and shown on the menu instead of the number; the basket still needs a
 * number, so priceEur becomes the first number found in the text, or null
 * when there is none (the action then keeps the product's previous price).
 */
const PLAIN_PRICE = /^\d+(?:[.,]\d+)?$/;
const productPriceField = z
  .string()
  .trim()
  .min(1, "Въведете цена.")
  .max(100, "Цената е твърде дълга (до 100 знака).")
  .superRefine((v, ctx) => {
    if (!PLAIN_PRICE.test(v)) return;
    const n = Number(v.replace(",", "."));
    if (!(n > 0)) ctx.addIssue({ code: "custom", message: "Цената трябва да е положително число." });
    else if (n >= 10000) ctx.addIssue({ code: "custom", message: "Цената е неправдоподобно висока." });
  })
  .transform((v): { priceEur: number | null; priceLabel: string | null } => {
    const toPrice = (s: string) => Math.round(Number(s.replace(",", ".")) * 100) / 100;
    if (PLAIN_PRICE.test(v)) return { priceEur: toPrice(v), priceLabel: null };
    const first = v.match(/\d+(?:[.,]\d+)?/)?.[0];
    const n = first ? toPrice(first) : NaN;
    return { priceEur: n > 0 && n < 10000 ? n : null, priceLabel: v };
  });

/** Optional short text: empty string → "" (kept, the UI falls back to BG). */
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} е твърде дълго (до ${max} знака).`);

export const productUpdateSchema = z.object({
  nameBg: z.string().trim().min(2, "Името (BG) трябва да е поне 2 символа.").max(120, "Името (BG) е твърде дълго."),
  nameEn: optionalText(120, "Името (EN)"),
  descriptionBg: optionalText(600, "Описанието (BG)"),
  descriptionEn: optionalText(600, "Описанието (EN)"),
  categoryId: z.string().trim().min(1, "Изберете категория."),
  price: productPriceField,
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
  sortOrder: z
    .string()
    .trim()
    .transform((v) => Number(v || "0"))
    .refine((n) => Number.isInteger(n) && n >= 0 && n < 10000, "Редът трябва да е цяло неотрицателно число."),
  isActive: z.boolean(),
});

export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
