"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  clearPendingPayment,
  readPendingPayment,
  type PendingPayment,
} from "@/components/checkout/pending-payment";

/**
 * "Order №… is waiting for payment — check the payment".
 *
 * The way back for a customer who left for the bank and did not return the
 * normal way: the Android app was killed in the background, the browser was
 * closed, the phone restarted. Shown on every public page until the payment
 * is settled or dismissed; hidden on the payment pages themselves and in the
 * admin. The link goes to the checking screen, so what it shows is always the
 * server's answer.
 */
export function PendingPaymentNotice() {
  const t = useTranslations("payment.notice");
  const pathname = usePathname();
  const [pending, setPending] = useState<PendingPayment | null>(null);

  useEffect(() => {
    setPending(readPendingPayment());
  }, [pathname]);

  if (!pending) return null;
  if (
    pathname.startsWith("/payment") ||
    pathname.startsWith("/checkout/pay") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-pizza-cream-dark bg-white px-4 py-3 shadow-2xl">
        <span aria-hidden className="text-xl">
          💳
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-pizza-ink">
          {t("text", { number: pending.orderNumber })}
        </p>
        <Link
          href={{ pathname: "/payment/return", query: { t: pending.token } }}
          className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          {t("action")}
        </Link>
        <button
          type="button"
          onClick={() => {
            clearPendingPayment(pending.token);
            setPending(null);
          }}
          aria-label={t("dismiss")}
          className="shrink-0 px-1 text-lg leading-none text-pizza-muted transition hover:text-pizza-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
