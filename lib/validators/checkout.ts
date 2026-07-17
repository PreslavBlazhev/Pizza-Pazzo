import { z } from "zod";

/**
 * Checkout validation (zod v4) for the SQLite + Prisma order system.
 *
 * Runs on the **server** when an order is placed (Part 2). Messages are in
 * Bulgarian — unlike the key-based auth validators, checkout errors are shown
 * as-is. The form sends lowercase method values ("cash_on_delivery",
 * "delivery"); the Part 2 order code maps them to the UPPERCASE Prisma values
 * (CASH_ON_DELIVERY / DELIVERY) before writing to the database.
 */
export const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Името трябва да е поне 2 символа."),
  customerEmail: z
    .email("Невалиден имейл адрес.")
    .trim()
    .transform((v) => v.toLowerCase()),
  customerPhone: z
    .string()
    .trim()
    .min(8, "Телефонът трябва да е поне 8 символа."),
  deliveryCity: z.string().trim().default("Варна"),
  deliveryAddress: z
    .string()
    .trim()
    .min(5, "Адресът трябва да е поне 5 символа."),
  deliveryNote: z
    .string()
    .trim()
    .max(300, "Бележката е твърде дълга (макс. 300 символа).")
    .optional(),
  paymentMethod: z.literal("cash_on_delivery", {
    error: "Наличен е само наложен платеж.",
  }),
  deliveryMethod: z.literal("delivery", {
    error: "Налична е само доставка.",
  }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
