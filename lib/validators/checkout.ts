import { z } from "zod";

/**
 * Checkout validation (zod v4) for the SQLite + Prisma order system.
 *
 * Runs on the **server** when an order is placed (Part 2). Messages are in
 * Bulgarian — unlike the key-based auth validators, checkout errors are shown
 * as-is. The form sends lowercase method values ("cash_on_delivery" |
 * "card_online", "delivery"); lib/checkout/place-order.ts maps them to the
 * UPPERCASE Prisma values (CASH_ON_DELIVERY | CARD_ONLINE / DELIVERY) before
 * writing to the database. Whether "card_online" is currently OFFERED is a
 * configuration question answered there, not here.
 */
export const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Името трябва да е поне 2 символа."),
  // Required — the "order accepted" confirmation is sent to this address.
  customerEmail: z
    .email("Въведете валиден имейл адрес — на него ще получите потвърждението.")
    .trim()
    .transform((v) => v.toLowerCase()),
  customerPhone: z
    .string()
    .trim()
    .min(8, "Телефонът трябва да е поне 8 символа."),
  deliveryCity: z.string().trim().default("Плевен"),
  deliveryAddress: z
    .string()
    .trim()
    .min(5, "Адресът трябва да е поне 5 символа."),
  deliveryNote: z
    .string()
    .trim()
    .max(300, "Бележката е твърде дълга (макс. 300 символа).")
    .optional(),
  paymentMethod: z.enum(["cash_on_delivery", "card_online"], {
    error: "Изберете начин на плащане.",
  }),
  deliveryMethod: z.literal("delivery", {
    error: "Налична е само доставка.",
  }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
