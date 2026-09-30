import { z } from "zod";
import { resolveDeliveryTown } from "@/lib/delivery-area";

/**
 * Checkout validation (zod v4) — runs on the SERVER when an order is placed.
 *
 * Every message is an error CODE, not a sentence: the server action turns it
 * into Bulgarian or English (messages/*.json → checkout.errors.<CODE>), so an
 * English customer never gets a Bulgarian refusal.
 *
 * The form sends lowercase method values ("cash_on_delivery" | "card_online",
 * "delivery"); lib/checkout/place-order.ts maps them to the UPPERCASE Prisma
 * values before writing to the database. Whether "card_online" is currently
 * OFFERED is a configuration question answered there, not here.
 */

/** Field-level refusal codes (checkout.errors.<code>). */
export const CHECKOUT_FIELD_ERRORS = [
  "NAME_SHORT",
  "EMAIL_INVALID",
  "PHONE_SHORT",
  "CITY_OUTSIDE_AREA",
  "ADDRESS_SHORT",
  "NOTE_TOO_LONG",
  "CONSENT_REQUIRED",
  /** Anything zod reports that has no specific code (e.g. a missing field). */
  "FIELD_INVALID",
] as const;
export type CheckoutFieldError = (typeof CHECKOUT_FIELD_ERRORS)[number];

/** Whole-form refusal codes (checkout.errors.<code>). */
export const CHECKOUT_FORM_ERRORS = [
  "STORE_CLOSED",
  "PAYMENT_METHOD",
  "CARD_UNAVAILABLE",
  "CART_INVALID",
  "PRODUCT_UNAVAILABLE",
  "VARIANT_INVALID",
  "EXTRAS_INVALID",
  "SAVE_FAILED",
] as const;
export type CheckoutFormError = (typeof CHECKOUT_FORM_ERRORS)[number];

export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2, "NAME_SHORT"),
  // Required — the "order accepted" confirmation is sent to this address.
  customerEmail: z
    .email("EMAIL_INVALID")
    .trim()
    .transform((v) => v.toLowerCase()),
  customerPhone: z.string().trim().min(8, "PHONE_SHORT"),
  // Only the towns in lib/delivery-area.ts; stored in their canonical spelling.
  deliveryCity: z
    .string({ error: "CITY_OUTSIDE_AREA" })
    .trim()
    .transform((v, ctx) => {
      const town = resolveDeliveryTown(v);
      if (!town) {
        ctx.addIssue({ code: "custom", message: "CITY_OUTSIDE_AREA" });
        return z.NEVER;
      }
      return town;
    }),
  deliveryAddress: z.string().trim().min(5, "ADDRESS_SHORT"),
  deliveryNote: z.string().trim().max(300, "NOTE_TOO_LONG").optional(),
  paymentMethod: z.enum(["cash_on_delivery", "card_online"], { error: "PAYMENT_METHOD" }),
  deliveryMethod: z.literal("delivery", { error: "PAYMENT_METHOD" }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * The three explicit confirmations required before an order (and before any
 * payment): Terms, Cancellation/Returns terms, and having read the Privacy
 * Policy. Each is its own unticked checkbox in the form; a missing one is a
 * field error on that checkbox — the server refuses it even when the browser
 * is bypassed.
 */
export const CONSENT_FIELDS = ["consentTerms", "consentRefunds", "consentPrivacy"] as const;
export type ConsentField = (typeof CONSENT_FIELDS)[number];

/** A ticked HTML checkbox posts "on"; JSON callers may send true. */
export function isTicked(value: unknown): boolean {
  return value === true || value === "on" || value === "true";
}
