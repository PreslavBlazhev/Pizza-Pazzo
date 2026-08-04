"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useStoreClosedMessage, useStoreStatus } from "./StoreStatusProvider";

/**
 * The notice a visitor meets when the restaurant is not taking orders.
 *
 * Deliberately NOT dismissible — no close button, no Escape, no click-outside,
 * and the page behind it cannot be scrolled. The owner asked for it this way:
 * the point is to stop people trying to order, and a notice that can be waved
 * away gets waved away. The trade-off, accepted knowingly, is that the menu is
 * unreadable while the shop is closed.
 *
 * It appears as soon as the status arrives (one fetch on mount) and clears
 * itself the moment the shop reopens — including when a timed closure runs
 * out, since the provider re-checks at the deadline.
 */
export function StoreClosedDialog() {
  const t = useTranslations("store");
  const status = useStoreStatus();
  const message = useStoreClosedMessage();
  const pathname = usePathname();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Never inside /admin: this is the customer's notice, and the staff who just
  // closed the shop must still be able to work — including to reopen it.
  const visible =
    status !== null && !status.isOpen && !pathname.startsWith("/admin");

  // Freeze the page behind the overlay, and put focus on the panel so a
  // keyboard or screen-reader user lands on the message rather than on links
  // they cannot see.
  useEffect(() => {
    if (!visible) return;

    // Both elements: <html> is what actually scrolls here (the body only has
    // min-h-screen), so locking the body alone still lets the page slide
    // around behind the overlay.
    const root = document.documentElement;
    const previousRoot = root.style.overflow;
    const previousBody = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      root.style.overflow = previousRoot;
      document.body.style.overflow = previousBody;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl focus:outline-none"
      >
        <div className="text-6xl" aria-hidden>
          🕒
        </div>

        <h2
          id={titleId}
          className="mt-5 font-display text-2xl font-bold text-pizza-ink sm:text-3xl"
        >
          {t("closedTitle")}
        </h2>

        {message && (
          <p className="mt-4 text-lg font-medium text-pizza-ink">{message}</p>
        )}

        <p className="mt-4 text-sm text-pizza-muted">{t("ordersPaused")}</p>
      </div>
    </div>
  );
}
