"use client";

import { useEffect, useState } from "react";
import { isAndroidPrinterAvailable, openAndroidPrinterSettings } from "@/lib/android-printer";

/**
 * Opens the Android app's native printer settings — choosing the paired
 * Bluetooth printer, paper width, Cyrillic encoding, test print.
 *
 * This button is the ONLY way in. The app used to float a small gear over
 * every page it showed, customers included; it is gone. The settings belong to
 * staff, so the door is drawn by the staff pages themselves, and a customer
 * never has anything to find.
 *
 * Outside the app it renders nothing at all: in a browser there is no bridge
 * and no Bluetooth printer, so a button leading nowhere would only confuse the
 * owner looking at the same page on a laptop.
 */
export function AndroidPrinterSettingsButton({ className }: { className?: string }) {
  // Bridge detection has to wait for mount: there is no `window` during SSR,
  // and the first client render must match the server's markup.
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(isAndroidPrinterAvailable());
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={() => openAndroidPrinterSettings()}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-xl border border-pizza-cream-dark bg-white px-4 py-2.5 text-sm font-semibold text-pizza-ink shadow-sm transition hover:bg-pizza-cream"
      }
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v7H6z" />
      </svg>
      Настройки на принтера
    </button>
  );
}
