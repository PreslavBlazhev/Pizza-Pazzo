/**
 * Current version of each legal document — the identifiers checkout stores
 * on an order as proof of WHAT the customer accepted (Order.consent*Version).
 *
 * Dependency-free on purpose: the server-side order code and the tests import
 * it without pulling in the long document texts.
 *
 * Rule: change a document's wording → bump its entry here AND its `updated`
 * date. Earlier orders keep the identifier they were placed under; the text of
 * any version is recoverable from git history (content/legal/<doc>.ts at the
 * commit where the version was set), listed in docs/UBB-COMPLIANCE.md.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-09-29",
  refunds: "2026-09-29",
  privacy: "2026-09-29",
  delivery: "2026-09-29",
  payment: "2026-09-29",
  cookies: "2026-09-29",
} as const;

export type LegalVersionedDoc = keyof typeof LEGAL_VERSIONS;

/** Display date for a "YYYY-MM-DD" version, e.g. "29.09.2026". */
export function versionDate(version: string): string {
  const [y, m, d] = version.split("-");
  return y && m && d ? `${d}.${m}.${y}` : version;
}
