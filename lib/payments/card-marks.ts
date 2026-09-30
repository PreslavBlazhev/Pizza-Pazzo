/**
 * Card-acceptance marks (Visa, Mastercard, Borica…) — SERVER ONLY.
 *
 * UBB-14: the bank requires the accepted card brands to be shown visibly —
 * but only the marks the bank actually approved, drawn from the official
 * artwork, and only once card payment is really live. So a mark is shown
 * when ALL of these hold, and never otherwise:
 *
 *   1. real card payments are enabled (a production provider — never the
 *      simulator, the staff demo or a sandbox);
 *   2. CARD_BRAND_MARKS lists the brand (comma-separated ids, set from what
 *      the merchant contract / bank confirms, e.g. "visa,mastercard,borica");
 *   3. the official artwork file exists at public/payment-marks/<id>.svg or
 *      .png (supplied by the bank or downloaded from the scheme's brand
 *      centre — none is bundled, none is drawn by us).
 *
 * Until then the function returns [] and no logo, badge or "we accept cards"
 * claim appears anywhere.
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

export function getCardBrandMarks(env: NodeJS.ProcessEnv = process.env): CardBrandMark[] {
  const config = getEffectivePaymentConfig(env);
  if (!config.enabled || config.isTest || config.environment !== "production") return [];

  const wanted = (env.CARD_BRAND_MARKS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is CardBrandId => s in BRANDS);

  const marks: CardBrandMark[] = [];
  for (const id of [...new Set(wanted)]) {
    const file = ["svg", "png"].find((ext) => existsSync(join(MARKS_DIR, `${id}.${ext}`)));
    if (file) marks.push({ id, label: BRANDS[id], src: `/payment-marks/${id}.${file}` });
  }
  return marks;
}
