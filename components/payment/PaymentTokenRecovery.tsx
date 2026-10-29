"use client";

import { useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";

/**
 * The tab remembers which order it is paying (PayWithCardForm stores the
 * order's access token in sessionStorage right before the bank). When the
 * bank's return could not be matched to an order on the server (an
 * unsigned or unrecognised return to SUCCESS_URL / FAILURE_URL), this sends
 * the same tab on to that order's own "checking" page. Nothing is decided
 * here: the next page asks the server, which asks the bank.
 */
export const PAY_TOKEN_KEY = "pp-pay-token";

export function rememberPaymentToken(token: string): void {
  try {
    window.sessionStorage.setItem(PAY_TOKEN_KEY, token);
  } catch {
    // Storage blocked (private mode) — the signed return still works.
  }
}

export function PaymentTokenRecovery({ backLabel }: { backLabel: string }) {
  const router = useRouter();

  useEffect(() => {
    let token = "";
    try {
      token = window.sessionStorage.getItem(PAY_TOKEN_KEY) ?? "";
    } catch {
      token = "";
    }
    if (/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      router.replace({ pathname: "/payment/return", query: { t: token } });
    }
  }, [router]);

  // Shown until (and unless) the tab knows its order.
  return (
    <p className="text-center">
      <Link href="/" className="font-semibold text-brand underline">
        {backLabel}
      </Link>
    </p>
  );
}
