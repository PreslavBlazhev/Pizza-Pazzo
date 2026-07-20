import { SITE } from "@/lib/constants";

/**
 * Merchant identity shown in the legal pages, contacts page and footer — the
 * single central source for company/restaurant data (`restaurantConfig` in
 * the brief). Names build on the existing `SITE` constant instead of
 * duplicating it; new legal-only fields are added here.
 *
 * ⚠️ TODO — FIELDS STILL PENDING FROM THE CLIENT, marked "ЗА ПОПЪЛВАНЕ" below.
 * None of these are guessed; do not fill them with placeholder-looking real
 * data. Legally REQUIRED before launch (чл. 4 ЗЕТ, чл. 47 ЗЗП): `uic`.
 * The company box on the legal pages renders each row only when it is
 * non-empty, so an unfilled field simply does not show yet.
 *  - `uic`              — ЕИК/Булстат.
 *  - `vatNumber`        — ДДС номер (only if VAT-registered).
 *  - `registeredAddress` — адрес на управление, if different from the
 *    restaurant's serving address (`address` below).
 *  - `managerName`       — управител / лице за контакт по ЗЗП.
 *
 * `city` is RESOLVED (2026-07-20, developer confirmation): Плевен — not
 * Варна, which was the placeholder default throughout the app until now
 * (checkout, saved addresses, Prisma column defaults, i18n placeholders —
 * all switched together with this field, see docs/client-questions.md #Q
 * "Градът за доставка: Варна или Плевен?" and client-delivery-questions.md).
 */
export const COMPANY = {
  legalName: SITE.legalName,
  displayName: SITE.name,
  /** ЕИК — FILL BEFORE LAUNCH. */
  uic: "",
  /** ДДС номер — only applicable once/if VAT-registered. */
  vatNumber: "",
  /** Restaurant / service address (already confirmed by the client). */
  address: SITE.address,
  city: "Плевен",
  /** Адрес на управление, if it differs from `address`. */
  registeredAddress: "",
  /** Управител / лице за контакт. */
  managerName: "",
  email: SITE.email,
  phone: SITE.phone,
  website: SITE.website,
} as const;
