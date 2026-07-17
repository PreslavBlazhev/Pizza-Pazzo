import { z } from "zod";
import { ASSIGNABLE_ROLES } from "@/types/auth";

/**
 * Zod schemas for auth, profile, address and admin forms (zod v4 syntax).
 *
 * These run on the **server** (inside server actions). Never trust the client
 * to have validated anything.
 *
 * ## Why the messages are keys
 *
 * The schemas are module-level constants, evaluated once at import — long before
 * a request exists, so there is no locale to translate against. Instead each
 * message carries a *key* into the `validation` namespace, and `toFieldErrors`
 * resolves it with the request's translator. Nothing here is ever shown raw.
 */

/** Bulgarian phone: 0888123456 / +359888123456, spaces and dashes tolerated. */
const phoneRegex = /^(\+359|0)\d{8,9}$/;

/**
 * Encodes a translation key (plus any placeholder values) into the single
 * string zod allows as a message. `toFieldErrors` is the only reader.
 */
function msg(key: string, values?: Record<string, string | number>): string {
  return values ? `${key}|${JSON.stringify(values)}` : key;
}

const phoneField = z
  .string()
  .trim()
  .min(8, msg("phoneMin"))
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .refine((v) => phoneRegex.test(v), { message: msg("phoneInvalid") });

const emailField = z
  .email(msg("emailInvalid"))
  .trim()
  .transform((v) => v.toLowerCase());

const passwordField = z
  .string()
  .min(8, msg("passwordMin"))
  // Supabase hashes with bcrypt, which silently truncates past 72 bytes.
  .max(72, msg("passwordMax"));

const fullNameField = z
  .string()
  .trim()
  .min(2, msg("nameMin"))
  .max(80, msg("nameMax"));

/** Optional text from a form: "" becomes null so the column stays clean. */
const optionalText = (max = 120) =>
  z
    .string()
    .trim()
    .max(max, msg("textMax", { max }))
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
      message: msg("termsRequired"),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: msg("passwordsMismatch"),
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, msg("passwordRequired")),
});

// ── Profile ───────────────────────────────────────────────────────────────

export const profileUpdateSchema = z.object({
  fullName: fullNameField,
  phone: phoneField,
});

// ── Addresses ─────────────────────────────────────────────────────────────

/**
 * Note `label`: an empty label used to default to the literal "Основен адрес".
 * It now falls back to null and the UI shows the translated
 * `profile.defaultAddress` — a label written into the database in one language
 * would have stayed that way for the other.
 */
export const addressSchema = z.object({
  label: z
    .string()
    .trim()
    .max(40, msg("labelMax"))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  fullName: fullNameField,
  phone: phoneField,
  city: z.string().trim().min(2, msg("cityRequired")).max(60, msg("cityMax")),
  addressLine: z
    .string()
    .trim()
    .min(5, msg("addressMin"))
    .max(160, msg("addressMax")),
  entrance: optionalText(10),
  floor: optionalText(10),
  apartment: optionalText(10),
  deliveryNote: optionalText(300),
  isDefault: checkboxField,
});

/** Same as addressSchema, plus the id of the address being edited.
 *  Ids are Prisma cuids (not UUIDs), so validate as a non-empty string. */
export const addressUpdateSchema = addressSchema.extend({
  id: z.string().min(1, msg("addressInvalid")),
});

// ── Admin ─────────────────────────────────────────────────────────────────

/**
 * Role assignment. `ASSIGNABLE_ROLES` excludes 'super_admin' by design, so that
 * role can never be granted through a form — only by manual SQL.
 */
export const adminRoleUpdateSchema = z.object({
  userId: z.string().min(1, msg("userInvalid")),
  role: z.enum(ASSIGNABLE_ROLES, { error: msg("roleInvalid") }),
});

/** Creating a staff/admin account from /admin/users. */
export const createAdminUserSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
  role: z.enum(["STAFF", "ADMIN"], { error: msg("roleStaffOrAdmin") }),
});

// ── Helpers ───────────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

/** Every key in the `validation` namespace, taken from the reference catalogue. */
type ValidationKey = keyof typeof import("@/messages/bg.json")["validation"];

/**
 * The subset of next-intl's translator this module needs. Narrow enough that a
 * `useTranslations("validation")` result satisfies it.
 */
type ValidationTranslator = (
  key: ValidationKey,
  values?: Record<string, string | number>
) => string;

/**
 * Flattens a ZodError into `{ field: "translated message" }` for the forms,
 * resolving the keys produced by `msg` above.
 */
export function toFieldErrors(
  error: z.ZodError,
  t: ValidationTranslator
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || result[key]) continue;

    const [messageKey, encodedValues] = issue.message.split("|");
    let values: Record<string, string | number> | undefined;

    if (encodedValues) {
      try {
        values = JSON.parse(encodedValues);
      } catch {
        // Malformed values should not cost the user their error message.
        values = undefined;
      }
    }

    // The key travelled through zod as a plain string, so it has to be asserted
    // back. `msg()` above is the only producer, and `check:i18n` guards the
    // catalogue, so a key that does not exist would already have failed there.
    result[key] = t(messageKey as ValidationKey, values);
  }

  return result;
}
