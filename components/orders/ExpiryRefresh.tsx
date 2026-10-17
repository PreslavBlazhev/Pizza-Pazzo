"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { nextCutoffAfter, orderRetentionEnabled } from "@/lib/order-retention";

/**
 * Re-renders a server page that lists orders (admin lists and details, the
 * customer's order history) at 22:30, when those orders expire — and when
 * the tab comes back after the cutoff passed while it was hidden or offline.
 * The server then simply no longer finds them (lib/db.ts).
 *
 * SWITCHED OFF with the retention (the history is kept): it does nothing.
 */
export function ExpiryRefresh() {
  const router = useRouter();
  useEffect(() => {
    if (!orderRetentionEnabled()) return;
    let cutoff = nextCutoffAfter(new Date()).getTime();
    const check = () => {
      if (Date.now() >= cutoff) {
        cutoff = nextCutoffAfter(new Date()).getTime();
        router.refresh();
      }
    };
    const id = window.setInterval(check, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
    };
  }, [router]);
  return null;
}
