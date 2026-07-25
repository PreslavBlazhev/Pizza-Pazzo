"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface HeaderShellProps {
  /**
   * Homepage mode: the header is transparent while the page is at the very
   * top (so it melts into the hero) and turns solid on the first scroll.
   * Every other page keeps the solid background from the start.
   */
  transparentAtTop?: boolean;
  children: React.ReactNode;
}

/**
 * Client wrapper around the sticky <header> element. Only the scroll state
 * lives here — the header content itself (nav, auth, cart) stays in the
 * server-rendered <Header />, so pages keep their rendering mode.
 */
export function HeaderShell({
  transparentAtTop = false,
  children,
}: HeaderShellProps) {
  // false on the server and on the first client render — no hydration
  // mismatch; the mount effect corrects it if the page loads pre-scrolled.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = !transparentAtTop || scrolled;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200",
        // Solid colour (not /80 + blur): the body's food-doodle pattern is
        // background-attachment: fixed, so anything translucent would keep
        // showing the doodles inside the bar.
        solid
          ? "border-pizza-cream-dark/60 bg-pizza-cream"
          : "border-transparent bg-transparent",
        scrolled && "shadow-[0_4px_16px_-10px_rgba(43,38,34,0.25)]"
      )}
    >
      {children}
    </header>
  );
}
