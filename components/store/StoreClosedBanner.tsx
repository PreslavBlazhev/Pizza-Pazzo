"use client";

import { useTranslations } from "next-intl";
import { useStoreClosed, useStoreClosedMessage } from "./StoreStatusProvider";

/**
 * Inline "we are closed" notice for the cart and the checkout — the places
 * where someone is actively trying to order and needs the reason in front of
 * them, not behind a dismissed modal.
 *
 * Renders nothing while the shop is open.
 */
export function StoreClosedBanner({ className }: { className?: string }) {
  const t = useTranslations("store");
  const closed = useStoreClosed();
  const message = useStoreClosedMessage();

  if (!closed) return null;

  return (
    <div
      role="status"
      className={`rounded-2xl border border-brand/30 bg-pizza-red-light px-5 py-4 text-sm text-brand-dark ${className ?? ""}`}
    >
      <p className="font-semibold">{t("closedTitle")}</p>
      {message && <p className="mt-1">{message}</p>}
      <p className="mt-1">{t("ordersPaused")}</p>
    </div>
  );
}
