/**
 * Legal documents (terms / privacy / cookies / delivery / payment / refunds) —
 * content model.
 *
 * The full text lives in `content/legal/*.ts` as { bg, en } pairs rather than
 * in the message catalogues: these are long documents, not UI strings, and
 * keeping each document in one file makes review by the client (and a lawyer)
 * possible without hunting through messages/*.json.
 *
 * Facts that can change without a new version of the text (the restaurant
 * address, phones, opening hours, the merchant identity, whether card payment
 * is switched on) are NOT written into the prose. They are `dynamic` blocks,
 * rendered by <LegalArticle /> from the same sources the rest of the site
 * uses, so a document can never contradict the footer or checkout.
 *
 * VERSIONING. `version` is the identifier an order stores when the customer
 * accepts the document at checkout (Order.consent*Version). Change the TEXT →
 * bump `version` and `updated`. Old versions stay readable in git history;
 * the order keeps the identifier it was placed under, so editing a document
 * later never changes what an earlier order agreed to.
 */
import type { Locale } from "@/i18n/routing";

/** A localized string — same shape the menu used before the DB move. */
export interface L {
  bg: string;
  en: string;
}

/** Facts rendered live from the site's own configuration. */
export type LegalDynamicBlock =
  /** Merchant name, ЕИК, ДДС, seat, correspondence address, restaurant, contacts. */
  | "merchant"
  /** Phones + e-mail as tel:/mailto: links, and the restaurant address. */
  | "contactChannels"
  /** The opening hours from Admin → Settings. */
  | "workingHours"
  /** Where we deliver — lib/delivery-area.ts. */
  | "deliveryArea"
  /** Which payment methods are active right now. */
  | "paymentMethods"
  /** The standard withdrawal form (Annex 6 ЗЗП / Annex I(B) Directive 2011/83/EU). */
  | "withdrawalForm";

/** One content block: a paragraph, a bullet list or a live fact. */
export type LegalBlock = { p: L } | { list: L[] } | { dynamic: LegalDynamicBlock };

export interface LegalSection {
  /** Stable anchor, so checkout and other documents can link to a section. */
  id?: string;
  heading: L;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  /** Route segment and messages key (`legal.<slug>`). */
  slug:
    | "terms"
    | "privacy"
    | "cookies"
    | "delivery"
    | "payment"
    | "refunds"
    | "app-privacy"
    | "account-deletion";
  /** Version identifier stored with orders, e.g. "2026-09-29". */
  version: string;
  /** Display date of the last revision, e.g. "29.09.2026". */
  updated: string;
  /** Shown before the numbered sections. */
  intro?: LegalBlock[];
  sections: LegalSection[];
  /** Render the merchant-identity box at the top. */
  showCompanyBox?: boolean;
}

export function pickL(text: L, locale: Locale): string {
  return text[locale] || text.bg;
}
