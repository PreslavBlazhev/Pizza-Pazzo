"use client";

/**
 * Opens the browser print dialog for the ticket page.
 *
 * Deliberately not automatic on load: staff open this page to check a ticket at
 * least as often as to print one, and an unattended dialog on every visit is
 * worse than one tap.
 */
export function PrintNowButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-pizza-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-700"
    >
      🖨 Принтирай
    </button>
  );
}
