import { z } from "zod";
import { WEEKDAYS } from "@/types/settings";

/**
 * Restaurant settings validation (zod v4). Runs on the server before anything
 * is written — the admin form is convenient, not trusted.
 *
 * Messages are in Bulgarian: the admin panel is staff-facing and BG-only.
 */

/** Strict "HH:mm", 00:00–23:59. Rejects 24:00, 11:60 and any seconds. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:mm" → minutes since midnight, for ordering comparisons. */
function toMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * One day. An open day must carry both bounds and end after it starts —
 * overnight spans are deliberately unsupported (the restaurant closes before
 * midnight). A closed day may leave the times empty; whatever is sent is
 * discarded so a closed day can never persist stray values.
 */
const daySchema = z
  .object({
    open: z.boolean(),
    from: z.string().trim().max(5).optional(),
    to: z.string().trim().max(5).optional(),
  })
  .transform((day) => (day.open ? day : { open: false as const, from: "", to: "" }))
  .superRefine((day, ctx) => {
    if (!day.open) return;

    const from = day.from ?? "";
    const to = day.to ?? "";

    if (!from) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Въведете начален час." });
    } else if (!TIME_PATTERN.test(from)) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Часът трябва да е във формат ЧЧ:ММ (00:00 – 23:59)." });
    }

    if (!to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Въведете краен час." });
    } else if (!TIME_PATTERN.test(to)) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Часът трябва да е във формат ЧЧ:ММ (00:00 – 23:59)." });
    }

    if (from && to && TIME_PATTERN.test(from) && TIME_PATTERN.test(to)) {
      if (toMinutes(from) === toMinutes(to)) {
        ctx.addIssue({ code: "custom", path: ["to"], message: "Началният и крайният час не може да съвпадат." });
      } else if (toMinutes(from) > toMinutes(to)) {
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message: "Крайният час трябва да е след началния (работа след полунощ не се поддържа).",
        });
      }
    }
  });

/** Bulgarian/international display phone: digits, spaces, +, -, ( ). */
const phonePattern = /^\+?[\d\s()-]{6,24}$/;

export const restaurantSettingsSchema = z.object({
  addressBg: z
    .string()
    .trim()
    .min(5, "Адресът трябва да е поне 5 символа.")
    .max(200, "Адресът е твърде дълъг (макс. 200 символа)."),
  addressEn: z
    .string()
    .trim()
    .min(5, "Адресът на английски трябва да е поне 5 символа.")
    .max(200, "Адресът е твърде дълъг (макс. 200 символа)."),
  primaryPhone: z
    .string()
    .trim()
    .min(6, "Въведете телефон.")
    .max(24, "Телефонът е твърде дълъг.")
    .regex(phonePattern, "Въведете валиден телефонен номер."),
  // Optional: an empty field is normalised to "" (stored as NULL).
  secondaryPhone: z
    .string()
    .trim()
    .max(24, "Телефонът е твърде дълъг.")
    .refine((v) => v === "" || phonePattern.test(v), "Въведете валиден телефонен номер.")
    .default(""),
  contactEmail: z
    .email("Въведете валиден имейл адрес.")
    .trim()
    .max(120, "Имейлът е твърде дълъг."),
  hours: z.object({
    monday: daySchema,
    tuesday: daySchema,
    wednesday: daySchema,
    thursday: daySchema,
    friday: daySchema,
    saturday: daySchema,
    sunday: daySchema,
  }),
});

export type RestaurantSettingsInput = z.infer<typeof restaurantSettingsSchema>;

/** Longest raw field the action accepts, as a cheap payload guard. */
export const MAX_SETTINGS_FIELD_LENGTH = 200;

/**
 * Reads the settings form out of FormData.
 *
 * Checkboxes only appear in FormData when ticked, so a missing `*.open` means
 * "closed" — the schema then clears that day's times.
 */
export function readSettingsFormData(formData: FormData): unknown {
  const str = (name: string) => String(formData.get(name) ?? "").slice(0, MAX_SETTINGS_FIELD_LENGTH);

  const hours = Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      {
        open: formData.get(`${day}.open`) === "on",
        from: str(`${day}.from`),
        to: str(`${day}.to`),
      },
    ])
  );

  return {
    addressBg: str("addressBg"),
    addressEn: str("addressEn"),
    primaryPhone: str("primaryPhone"),
    secondaryPhone: str("secondaryPhone"),
    contactEmail: str("contactEmail"),
    hours,
  };
}
