/**
 * Legal documents (terms / privacy / cookies / delivery) — content model.
 *
 * The full text lives in `content/legal/*.ts` as { bg, en } pairs rather than
 * in the message catalogues: these are long documents, not UI strings, and
 * keeping each document in one file makes review by the client (and a lawyer)
 * possible without hunting through messages/*.json.
 *
 * ⚠️ The documents are DRAFTS prepared by the developer. Before launch they
 * must be reviewed by the client — and ideally a lawyer. Open items (ЕИК,
 * city, retention periods) are listed in docs/client-legal-review.md.
 */
import type { Locale } from "@/i18n/routing";

/** A localized string — same shape the menu used before the DB move. */
export interface L {
  bg: string;
  en: string;
}

/** One content block: a paragraph or a bullet list. */
export type LegalBlock = { p: L } | { list: L[] };

export interface LegalSection {
  heading: L;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  /** Route segment and messages key (`legal.<slug>`). */
  slug: "terms" | "privacy" | "cookies" | "delivery" | "refunds";
  /** Display date of the last revision, e.g. "18.07.2026". */
  updated: string;
  /** Shown before the numbered sections. */
  intro?: LegalBlock[];
  sections: LegalSection[];
  /** Render the merchant-identity box (terms + privacy). */
  showCompanyBox?: boolean;
}

export function pickL(text: L, locale: Locale): string {
  return text[locale] || text.bg;
}
