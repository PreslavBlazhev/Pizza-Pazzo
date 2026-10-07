/**
 * Card-acceptance marks (Visa, Mastercard, Borica…) — SERVER ONLY.
 *
 * UBB-14: the accepted card brands must be shown visibly, drawn from the
 * official artwork only. Two places, two rules:
 *
 * CHECKOUT (getCardBrandMarks) — next to the card option, a mark says "you
 * can pay with this card here", so it is shown only when ALL of these hold:
 *   1. real card payments are enabled (a production provider — never the
 *      simulator, the staff demo or a sandbox);
 *   2. CARD_BRAND_MARKS lists the brand (comma-separated ids, set from what
 *      the merchant contract / bank confirms, e.g. "visa,mastercard,borica");
 *   3. the official artwork file exists at public/payment-marks/<id>.svg or
 *      .png.
 *
 * FOOTER (getFooterSchemeMarks) — ОББ asked, BEFORE handing over the
 * technical integration, for the logos of the international card
 * organisations to be visible in the site footer (bank feedback, 07.10.2026;
 * docs/UBB-COMPLIANCE.md UBB-14). So the footer shows the schemes named in
 * ОББ's virtual-POS request form whether or not card payment is live — but
 * still only from official files in public/payment-marks/ (provenance in
 * public/payment-marks/SOURCES.md), and never worded as "online card payment
 * works" while isCardPaymentLive() is false.
 *
 * Nothing is drawn by us; a missing file simply means no mark.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getEffectivePaymentConfig } from "@/lib/payments/providers";

/** Known brands and their accessible names. */
const BRANDS = {
  visa: "Visa",
  mastercard: "Mastercard",
  maestro: "Maestro",
  borica: "Borica",
} as const;
export type CardBrandId = keyof typeof BRANDS;

export interface CardBrandMark {
  id: CardBrandId;
  label: string;
  /** Public URL of the official artwork. */
  src: string;
}

const MARKS_DIR = join(process.cwd(), "public", "payment-marks");

/**
 * The card schemes named in ОББ's virtual-POS request form, in that order.
 * Nothing else is added by assumption.
 */
export const FOOTER_SCHEME_IDS = ["visa", "mastercard", "borica"] as const satisfies readonly CardBrandId[];

function markFor(id: CardBrandId, dir: string): CardBrandMark | null {
  const file = ["svg", "png"].find((ext) => existsSync(join(dir, `${id}.${ext}`)));
  return file ? { id, label: BRANDS[id], src: `/payment-marks/${id}.${file}` } : null;
}

/** Real (production, non-test) card payment is switched on. */
export function isCardPaymentLive(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = getEffectivePaymentConfig(env);
  return config.enabled && !config.isTest && config.environment === "production";
}

export function getCardBrandMarks(env: NodeJS.ProcessEnv = process.env): CardBrandMark[] {
  if (!isCardPaymentLive(env)) return [];

  const wanted = (env.CARD_BRAND_MARKS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is CardBrandId => s in BRANDS);

  const marks: CardBrandMark[] = [];
  for (const id of [...new Set(wanted)]) {
    const mark = markFor(id, MARKS_DIR);
    if (mark) marks.push(mark);
  }
  return marks;
}

/** Footer marks: every scheme from the request form whose official file is present. */
export function getFooterSchemeMarks(dir: string = MARKS_DIR): CardBrandMark[] {
  return FOOTER_SCHEME_IDS.map((id) => markFor(id, dir)).filter((m): m is CardBrandMark => m !== null);
}
