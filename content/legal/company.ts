import { SITE } from "@/lib/constants";
import type { L } from "./types";

/**
 * The merchant — the ONE source of the seller's identity for the legal pages,
 * the contacts page, the footer, checkout and the customer e-mails.
 *
 * Every registry field below was checked against an official source on
 * 2026-09-29 (details and the raw evidence: docs/UBB-BUSINESS-DATA.md):
 *   - Търговски регистър (portal.registryagency.bg, ЕИК 203300275):
 *     name „ПИЦА ПАЦО“, legal form ЕООД, English name PIZZA PAZZO LTD,
 *     седалище и адрес на управление гр. Плевен 5800,
 *     ул. „Димитър Константинов“ № 37, ет. 4, ап. 5.
 *   - VIES (European Commission): BG203300275 is a VALID VAT number.
 *
 * The seat/management address (№ 37) is NOT the restaurant. The restaurant
 * (обект) address, the phones and the public e-mail are operational data the
 * owner edits in Admin → Settings (lib/restaurant-settings.ts); the older
 * "№ 35" found in early notes matches no official record and is not used.
 *
 * Nothing here belongs to the web developer / agency — the site's builder is
 * deliberately not named anywhere as a party to the contract.
 */
export const COMPANY = {
  /** Registered name incl. legal form, as the Commercial Register writes it. */
  legalName: { bg: "„ПИЦА ПАЦО“ ЕООД", en: "PIZZA PAZZO LTD" } satisfies L,
  /** Trading name customers know. */
  displayName: SITE.name,
  /** ЕИК (Unified Identification Code). */
  uic: "203300275",
  /** ДДС номер — confirmed valid in VIES on 2026-09-29. */
  vatNumber: "BG203300275",
  /** Седалище и адрес на управление — Търговски регистър. */
  registeredAddress: {
    bg: "гр. Плевен 5800, ул. „Димитър Константинов“ № 37, ет. 4, ап. 5",
    en: "37 Dimitar Konstantinov St., floor 4, apt. 5, 5800 Pleven, Bulgaria",
  } satisfies L,
  /**
   * Адрес за кореспонденция. The register holds no separate one, so the
   * registered seat is the address for written correspondence (and for
   * written withdrawal notices and complaints).
   */
  correspondenceAddress: {
    bg: "гр. Плевен 5800, ул. „Димитър Константинов“ № 37, ет. 4, ап. 5",
    en: "37 Dimitar Konstantinov St., floor 4, apt. 5, 5800 Pleven, Bulgaria",
  } satisfies L,
  website: "pizzapazzo.bg",
  /**
   * Registration of the food business with the Bulgarian Food Safety Agency
   * (БАБХ), Art. 24 of the Food Act — verified 2026-09-30 in BFSA's public
   * "Регистър на обекти за обществено хранене (ОХ)" (public-iisr.bfsa.bg,
   * report register_4_2, ЕИК 203300275): рег. № 152700478, удостоверение
   * № 101-7892/16.04.2015, „Пицария с доставка по домовете“, бул. „Георги
   * Кочев“ № 13, Плевен, status Активен, ОДБХ Плевен. Evidence:
   * docs/ubb-evidence/registry/.
   */
  foodRegistration: {
    number: "152700478",
    certificate: "101-7892/16.04.2015",
    authority: { bg: "ОДБХ – Плевен", en: "RFSD Pleven (BFSA)" },
  } as null | { number: string; certificate: string; authority: L },
} as const;

/** Plain strings of the merchant identity for one locale. */
export function companyFor(locale: string) {
  const pick = (value: L) => (locale === "en" ? value.en : value.bg);
  return {
    legalName: pick(COMPANY.legalName),
    displayName: COMPANY.displayName,
    uic: COMPANY.uic,
    vatNumber: COMPANY.vatNumber,
    registeredAddress: pick(COMPANY.registeredAddress),
    correspondenceAddress: pick(COMPANY.correspondenceAddress),
    website: COMPANY.website,
    foodRegistration: COMPANY.foodRegistration
      ? {
          number: COMPANY.foodRegistration.number,
          certificate: COMPANY.foodRegistration.certificate,
          authority: pick(COMPANY.foodRegistration.authority),
        }
      : null,
  };
}
