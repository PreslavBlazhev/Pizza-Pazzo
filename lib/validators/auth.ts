import { z } from "zod";
import { ASSIGNABLE_ROLES } from "@/types/auth";

/**
 * Zod schemas for auth, profile, address and admin forms (zod v4 syntax).
 * All messages are in Bulgarian — they are shown directly to the user.
 *
 * These run on the **server** (inside server actions). Never trust the client
 * to have validated anything.
 */

/** Bulgarian phone: 0888123456 / +359888123456, spaces and dashes tolerated. */
const phoneRegex = /^(\+359|0)\d{8,9}$/;

const phoneField = z
  .string()
  .trim()
  .min(8, "Телефонът трябва да е поне 8 символа.")
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .refine((v) => phoneRegex.test(v), {
    message: "Въведете валиден български телефон, напр. 0888123456.",
  });

const emailField = z
  .email("Въведете валиден имейл адрес.")
  .trim()
  .transform((v) => v.toLowerCase());

const passwordField = z
  .string()
  .min(8, "Паролата трябва да е поне 8 символа.")
  // Supabase hashes with bcrypt, which silently truncates past 72 bytes.
  .max(72, "Паролата не може да е по-дълга от 72 символа.");

const fullNameField = z
  .string()
  .trim()
  .min(2, "Името трябва да е поне 2 символа.")
  .max(80, "Името не може да е по-дълго от 80 символа.");

/** Optional text from a form: "" becomes null so the column stays clean. */
const optionalText = (max = 120) =>
  z
    .string()
    .trim()
    .max(max, `Полето не може да е по-дълго от ${max} символа.`)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

/**
 * An HTML checkbox in FormData is "on" when ticked and absent (null) when not.
 * Boolean() alone would turn the string "false" into true, so map explicitly.
 */
const checkboxField = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean()
);

// ── Auth ──────────────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    fullName: fullNameField,
    email: emailField,
    phone: phoneField,
    password: passwordField,
    confirmPassword: z.string(),
    acceptedTerms: checkboxField.refine((v) => v === true, {
      message: "Трябва да приемете Общите условия, за да продължите.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Паролите не съвпадат.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Паролата е задължителна."),
});

// ── Profile ───────────────────────────────────────────────────────────────

export const profileUpdateSchema = z.object({
  fullName: fullNameField,
  phone: phoneField,
});

// ── Addresses ─────────────────────────────────────────────────────────────

export const addressSchema = z.object({
  label: z
    .string()
    .trim()
    .max(40, "Етикетът не може да е по-дълъг от 40 символа.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "Основен адрес")),
  fullName: fullNameField,
  phone: phoneField,
  city: z
    .string()
    .trim()
    .min(2, "Градът е задължителен.")
    .max(60, "Градът не може да е по-дълъг от 60 символа."),
  addressLine: z
    .string()
    .trim()
    .min(5, "Адресът трябва да е поне 5 символа.")
    .max(160, "Адресът не може да е по-дълъг от 160 символа."),
  entrance: optionalText(10),
  floor: optionalText(10),
  apartment: optionalText(10),
  deliveryNote: optionalText(300),
  isDefault: checkboxField,
});

/** Same as addressSchema, plus the id of the address being edited. */
export const addressUpdateSchema = addressSchema.extend({
  id: z.uuid("Невалиден адрес."),
});

// ── Admin ─────────────────────────────────────────────────────────────────

/**
 * Role assignment. `ASSIGNABLE_ROLES` excludes 'super_admin' by design, so that
 * role can never be granted through a form — only by manual SQL.
 */
export const adminRoleUpdateSchema = z.object({
  userId: z.uuid("Невалиден потребител."),
  role: z.enum(ASSIGNABLE_ROLES, { error: "Невалидна роля." }),
});

/** Creating a staff/admin account from /admin/users. */
export const createAdminUserSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
  role: z.enum(["staff", "admin"], {
    error: "Ролята трябва да е staff или admin.",
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

/** Flattens a ZodError into `{ field: "първото съобщение" }` for the forms. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) {
      result[key] = issue.message;
    }
  }
  return result;
}
