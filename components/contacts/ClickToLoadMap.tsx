"use client";

import { useState } from "react";

/**
 * The Google map, loaded only when the visitor asks for it.
 *
 * An embedded Google map sends the visitor's IP address to Google and can set
 * Google's cookies — not strictly necessary for the site to work, so it must
 * not happen on page load. Until the button is pressed nothing is requested
 * from Google (docs/UBB-COMPLIANCE.md, UBB-03). The choice is not remembered:
 * every visit starts without the map.
 */
export function ClickToLoadMap({
  src,
  title,
  buttonLabel,
  notice,
}: {
  src: string;
  title: string;
  buttonLabel: string;
  /** Rendered server-side (it contains a link to the cookie policy). */
  notice: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <iframe
        title={title}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-[380px] w-full border-0"
      />
    );
  }

  return (
    <div className="flex h-[380px] w-full flex-col items-center justify-center gap-4 bg-pizza-cream/50 px-6 text-center">
      <span aria-hidden className="text-4xl">🗺️</span>
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className="rounded-full bg-pizza-green px-6 py-3 font-semibold text-white transition hover:bg-pizza-green-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-pizza-green/40"
      >
        {buttonLabel}
      </button>
      <p className="max-w-md text-xs text-pizza-muted">{notice}</p>
    </div>
  );
}
