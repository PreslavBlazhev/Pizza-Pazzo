"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TicketLine } from "@/lib/printer/ticket-template";
import {
  PRINT_LOGO_HEIGHT_PX,
  PRINT_LOGO_SRC,
  PRINT_LOGO_WIDTH_PX,
} from "@/lib/printer/ticket-logo";

/**
 * The browser rendering of a built ticket — shared by the real print page
 * (PrintTicket) and the live preview in /admin/settings/print, so what the
 * owner previews is exactly what prints.
 *
 * The header lines (`line.logo`) are replaced by ONE logo image. If the image
 * fails to load, the header text is shown instead, so a ticket never comes out
 * with neither — and never with both.
 */

/** Marks every ticket logo; PrintNowButton waits for these before printing. */
export const TICKET_LOGO_SELECTOR = "img[data-ticket-logo]";

const ALIGN_CLASS = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
} as const;

function TicketRow({ line }: { line: TicketLine }) {
  if (line.divider) {
    return <div aria-hidden className="my-1 border-t border-dashed border-black" />;
  }

  return (
    <div
      className={`flex gap-2 ${ALIGN_CLASS[line.align]}`}
      style={{
        fontSize: `${line.fontPt}pt`,
        fontWeight: line.bold ? 700 : 400,
      }}
    >
      <span className="whitespace-pre-wrap break-words">{line.text}</span>
      {line.right && <span className="ml-auto whitespace-nowrap">{line.right}</span>}
    </div>
  );
}

/**
 * The logo, centred, at a fixed printed width with its own proportions.
 * Renders `fallback` instead when the image cannot be loaded.
 */
export function TicketLogo({ width, fallback }: { width: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // A server-rendered <img> can fail before React attaches onError; catch that.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <>{fallback}</>;

  return (
    <div className="flex justify-center pb-1">
      {/* A plain <img>: the print dialog needs the static file, not an optimiser URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        data-ticket-logo=""
        src={PRINT_LOGO_SRC}
        alt="Pizza Pazzo"
        width={PRINT_LOGO_WIDTH_PX}
        height={PRINT_LOGO_HEIGHT_PX}
        loading="eager"
        decoding="sync"
        onError={() => setFailed(true)}
        style={{ width, height: "auto", maxWidth: "100%" }}
      />
    </div>
  );
}

export function TicketLines({ lines, logoWidth }: { lines: TicketLine[]; logoWidth: string }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.logo) {
      out.push(<TicketRow key={`${line.section}-${i}`} line={line} />);
      continue;
    }
    // One logo for the whole run of header lines; the run is its fallback.
    const run: TicketLine[] = [];
    while (i < lines.length && lines[i].logo) run.push(lines[i++]);
    i--;
    out.push(
      <TicketLogo
        key={`logo-${i}`}
        width={logoWidth}
        fallback={run.map((l, j) => (
          <TicketRow key={`header-${j}`} line={l} />
        ))}
      />
    );
  }
  return <>{out}</>;
}
