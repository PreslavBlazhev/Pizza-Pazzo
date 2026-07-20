import { SITE } from "@/lib/constants";

/**
 * Merchant identity shown in the legal pages, contacts page and footer — the
 * single central source for company/restaurant data (`restaurantConfig` in
 * the brief). Names build on the existing `SITE` constant instead of
 * duplicating it; new legal-only fields are added here.
 *
 * ⚠️ TODO — FIELDS PENDING FROM THE CLIENT, marked "ЗА ПОПЪЛВАНЕ" below.
 * None of these are guessed; do not fill them with placeholder-looking real
 * data. Legally REQUIRED before launch (чл. 4 ЗЕТ, чл. 47 ЗЗП): `uic`,
 * `city`. The company box on the legal pages renders each row only when it
 * is non-empty, so an unfilled field simply does not show yet.
 *  - `uic`              — ЕИК/Булстат.
 *  - `vatNumber`        — ДДС номер (only if VAT-registered).
 *  - `city`              — Варна или Плевен.
 *  - `registeredAddress` — адрес на управление, if different from the
 *    restaurant's serving address (`address` below).
 *  - `managerName`       — управител / лице за контакт по ЗЗП.
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
  /** City — pending client confirmation. */
  city: "",
  /** Адрес на управление, if it differs from `address`. */
  registeredAddress: "",
  /** Управител / лице за контакт. */
  managerName: "",
  email: SITE.email,
  phone: SITE.phone,
  website: SITE.website,
} as const;
