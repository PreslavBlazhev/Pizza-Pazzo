import { SITE } from "@/lib/constants";

/**
 * Merchant identity shown in the legal pages.
 *
 * ⚠️ TWO FIELDS ARE PENDING FROM THE CLIENT (docs/client-legal-review.md):
 *  - `uic`  — ЕИК/Булстат. Legally REQUIRED on the site (чл. 4 ЗЕТ, чл. 47
 *    ЗЗП). The company box renders the row only when filled; the launch
 *    checklist blocks going live while it is empty.
 *  - `city` — Варна или Плевен (same open question as the checkout default).
 */
export const COMPANY = {
  legalName: SITE.legalName,
  displayName: SITE.name,
  /** ЕИК — FILL BEFORE LAUNCH. */
  uic: "",
  address: SITE.address,
  /** City — pending client confirmation. */
  city: "",
  email: SITE.email,
  phone: SITE.phone,
  website: SITE.website,
} as const;
