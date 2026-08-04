"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useStoreClosedMessage, useStoreStatus } from "./StoreStatusProvider";

/**
 * The notice a visitor meets when the restaurant is not taking orders.
 *
 * Dismissible on purpose. The menu, the gallery and the contacts are still
 * worth reading at midnight, and trapping someone behind a modal to tell them
 * to come back tomorrow only makes them leave. Ordering stays blocked whether
 * or not this is dismissed — the add-to-cart buttons, the checkout form and
 * `createOrder` each check the status themselves.
 *
 * The dismissal is remembered per closure (reason + reopening time) in
 * sessionStorage: browsing on does not bring it back, but a NEW closure — or
 * the next visit — does.
 */

const DISMISSED_KEY = "pp-store-closed-dismissed";

export function StoreClosedDialog() {
  const t = useTranslations("store");
  const status = useStoreStatus();
  const message = useStoreClosedMessage();
  const pathname = usePathname();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Identifies THIS closure. A different reason or a new reopening time is a
  // different closure and deserves to be announced again.
  //
  // Never inside /admin: this is the customer's notice, and the staff who just
  // closed the shop do not need it thrown in front of every admin screen. They
  // have the state in the sidebar.
  const signature =
    status && !status.isOpen && !pathname.startsWith("/admin")
      ? `${status.reason}|${status.reopensAt}`
      : null;

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY));
    } catch {
      // Private mode / storage disabled — the dialog simply shows every time.
    }
  }, []);

  const visible = signature !== null && dismissed !== signature;

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
    // `dismiss` closes over `signature`, which is in the dep list already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, signature]);

  function dismiss() {
    if (!signature) return;
    setDismissed(signature);
    try {
      sessionStorage.setItem(DISMISSED_KEY, signature);
    } catch {
      // Nothing to do — the in-memory state still hides it for this page.
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl focus:outline-none"
      >
        <div className="text-5xl" aria-hidden>
          🕒
        </div>

        <h2
          id={titleId}
          className="mt-4 font-display text-2xl font-bold text-pizza-ink"
        >
          {t("closedTitle")}
        </h2>

        {message && <p className="mt-3 text-pizza-muted">{message}</p>}

        <p className="mt-3 text-sm text-pizza-muted">{t("ordersPaused")}</p>

        <button
          type="button"
          onClick={dismiss}
          className="mt-6 w-full rounded-full bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
        >
          {t("understood")}
        </button>
      </div>
    </div>
  );
}
