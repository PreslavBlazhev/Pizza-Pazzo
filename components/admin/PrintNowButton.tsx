"use client";

import { useState } from "react";
import { TICKET_LOGO_SELECTOR } from "@/components/admin/TicketLines";

/** Longest we wait for the logo before printing with the text header instead. */
const LOGO_TIMEOUT_MS = 5000;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Resolves once every ticket logo on the page has loaded (and is decoded) or
 * failed. One still loading after the timeout is treated as failed: its
 * `error` event switches that ticket to the text header (TicketLogo), so the
 * printout never has an empty space where the logo should be.
 */
async function waitForTicketLogos(): Promise<void> {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(TICKET_LOGO_SELECTOR));
  if (images.length === 0) return;

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          };
          const timer = setTimeout(() => {
            if (!(img.complete && img.naturalWidth > 0)) {
              img.dispatchEvent(new Event("error"));
            }
            done();
          }, LOGO_TIMEOUT_MS);
          if (img.complete) {
            // Loaded (decode so the first print frame has the pixels) or broken.
            if (img.naturalWidth > 0) img.decode().catch(() => {}).finally(done);
            else done();
            return;
          }
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        })
    )
  );
  // Let React swap any failed logo for its text before the dialog snapshots the page.
  await nextFrame();
  await nextFrame();
}

/**
 * Opens the browser print dialog for the ticket page — after the logo has
 * loaded, so it is never missing from the printout.
 *
 * Deliberately not automatic on load: staff open this page to check a ticket at
 * least as often as to print one, and an unattended dialog on every visit is
 * worse than one tap.
 */
export function PrintNowButton() {
  const [waiting, setWaiting] = useState(false);

  const onClick = async () => {
    if (waiting) return;
    setWaiting(true);
    try {
      await waitForTicketLogos();
    } finally {
      setWaiting(false);
    }
    window.print();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={waiting}
      className="rounded-lg bg-pizza-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-700 disabled:opacity-60"
    >
      {waiting ? "Зареждане на логото…" : "🖨 Принтирай"}
    </button>
  );
}
