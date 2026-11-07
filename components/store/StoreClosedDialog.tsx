"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useClosedNotice, useStoreClosedMessage, useStoreStatus } from "./StoreStatusProvider";

/**
 * The notice a visitor meets when they try to ORDER while the restaurant is
 * not taking orders.
 *
 * It is never shown on page load: the site and the menu stay freely
 * browsable. It opens only when "Добави в количката" or the way to checkout is
 * used while the shop is closed (see useClosedNotice().ensureOpen), and
 * "Продължи с разглеждането на менюто" closes it without a reload, leaving the
 * visitor exactly where they were. The next attempt shows it again.
 *
 * It clears itself the moment the shop reopens — including when a timed
 * closure runs out, since the provider re-checks at the deadline.
 */
export function StoreClosedDialog() {
  const t = useTranslations("store");
  const status = useStoreStatus();
  const message = useStoreClosedMessage();
  const { noticeOpen, hideNotice } = useClosedNotice();
  const pathname = usePathname();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Never inside /admin: this is the customer's notice, and the staff who just
  // closed the shop must still be able to work — including to reopen it.
  const visible =
    noticeOpen && status !== null && !status.isOpen && !pathname.startsWith("/admin");

  // Freeze the page behind the overlay (the scroll position is kept), and put
  // focus on the panel so a keyboard or screen-reader user lands on the
  // message. On close, focus goes back to the button that was pressed.
  useEffect(() => {
    if (!visible) return;

    // Both elements: <html> is what actually scrolls here (the body only has
    // min-h-screen), so locking the body alone still lets the page slide
    // around behind the overlay.
    const root = document.documentElement;
    const previousRoot = root.style.overflow;
    const previousBody = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hideNotice();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = previousRoot;
      document.body.style.overflow = previousBody;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [visible, hideNotice]);

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

        <button
          type="button"
          onClick={hideNotice}
          data-testid="store-closed-continue"
          className="mt-6 w-full rounded-full bg-pizza-green px-6 py-3.5 font-semibold text-white shadow-soft transition hover:bg-pizza-green-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/40 focus-visible:ring-offset-2"
        >
          {t("continueBrowsing")}
        </button>
      </div>
    </div>
  );
}
