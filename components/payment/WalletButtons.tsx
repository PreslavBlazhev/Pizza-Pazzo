"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { rememberPaymentToken } from "./PaymentTokenRecovery";
import type { WalletClientConfig } from "@/lib/payments/wallets/config";

/**
 * Google Pay and Apple Pay buttons for one card order.
 *
 *   - Official buttons only: Google's own createButton (pay.js) and Apple's
 *     CSS Apple Pay button. Each appears ONLY when the device can pay with it
 *     (Google isReadyToPay / ApplePaySession.canMakePayments); otherwise
 *     nothing is drawn and the card button below is the way to pay.
 *   - The sheet shows the amount the SERVER stored; the server charges that
 *     stored amount whatever the browser sends.
 *   - The encrypted wallet data goes to /api/payments/wallet and nowhere else;
 *     nothing here logs it.
 */

const GOOGLE_PAY_JS = "https://pay.google.com/gp/p/js/pay.js";

/* ── Minimal typings for the two wallet APIs ─────────────────────────── */
interface GooglePaymentsClient {
  isReadyToPay(request: unknown): Promise<{ result: boolean }>;
  createButton(options: Record<string, unknown>): HTMLElement;
  loadPaymentData(request: unknown): Promise<{ paymentMethodData: { tokenizationData: { token: string } } }>;
}
interface GoogleNamespace {
  payments: { api: { PaymentsClient: new (options: { environment: string }) => GooglePaymentsClient } };
}
interface ApplePaySessionLike {
  onvalidatemerchant: ((e: { validationURL: string }) => void) | null;
  onpaymentauthorized: ((e: { payment: { token: unknown } }) => void) | null;
  oncancel: (() => void) | null;
  begin(): void;
  abort(): void;
  completeMerchantValidation(session: unknown): void;
  completePayment(result: { status: number }): void;
}
interface ApplePaySessionStatic {
  new (version: number, request: Record<string, unknown>): ApplePaySessionLike;
  canMakePayments(): boolean;
  supportsVersion(version: number): boolean;
  STATUS_SUCCESS: number;
  STATUS_FAILURE: number;
}
declare global {
  interface Window {
    google?: GoogleNamespace;
    ApplePaySession?: ApplePaySessionStatic;
  }
}

/** Apple's rule: show the button when the device can make payments. Never on the server. */
function canUseApplePay(): boolean {
  try {
    const AP = window.ApplePaySession;
    return !!AP && AP.supportsVersion(3) && AP.canMakePayments();
  } catch {
    return false; // e.g. inside an app's web view
  }
}
const noSubscription = () => () => {};

let googleScript: Promise<void> | null = null;
function loadGooglePay(): Promise<void> {
  if (window.google?.payments?.api) return Promise.resolve();
  googleScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GOOGLE_PAY_JS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      googleScript = null;
      reject(new Error("pay.js"));
    };
    document.head.appendChild(s);
  });
  return googleScript;
}

export interface WalletLabels {
  separator: string;
  processing: string;
  cancelled: string;
  declined: string;
  unavailable: string;
  /** Messages for the server's error codes; missing ones fall back to `unavailable`. */
  errors: Record<string, string>;
}

type Wallet = "GOOGLE_PAY" | "APPLE_PAY";
type Outcome = { paid: boolean; next: string | null };

export function WalletButtons({
  token,
  locale,
  config,
  labels,
}: {
  token: string;
  locale: "bg" | "en";
  config: WalletClientConfig;
  labels: WalletLabels;
}) {
  const [googleReady, setGoogleReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const googleBox = useRef<HTMLDivElement>(null);
  const googleClient = useRef<GooglePaymentsClient | null>(null);

  const setWorking = (on: boolean) => {
    busyRef.current = on;
    setBusy(on);
  };

  /** Sends the encrypted data; the answer decides where the customer goes. */
  const submit = useCallback(
    async (wallet: Wallet, walletData: string): Promise<Outcome> => {
      rememberPaymentToken(token);
      const pending = `${locale === "en" ? "/en" : ""}/payment/pending?t=${encodeURIComponent(token)}`;
      let res: Response;
      try {
        res = await fetch("/api/payments/wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, locale, wallet, walletData }),
          cache: "no-store",
        });
      } catch {
        // The request may have reached the bank: the pending page finds out.
        return { paid: false, next: pending };
      }
      const data = (await res.json().catch(() => ({}))) as { state?: string; next?: string | null; error?: string };
      if (data.state === "DECLINED") {
        setMessage(labels.declined);
        return { paid: false, next: null };
      }
      if (data.state) return { paid: data.state === "PAID", next: data.next ?? pending };
      setMessage(labels.errors[data.error ?? ""] ?? labels.unavailable);
      return { paid: false, next: null };
    },
    [token, locale, labels]
  );

  const go = (next: string | null) => {
    if (next) window.location.assign(next);
    else setWorking(false);
  };

  /* ── Google Pay ─────────────────────────────────────────────────────── */
  const google = config.google;
  useEffect(() => {
    if (!google) return;
    let cancelled = false;
    const card = {
      type: "CARD",
      parameters: { allowedAuthMethods: google.authMethods, allowedCardNetworks: google.networks },
    };
    const request = {
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [
        {
          ...card,
          tokenizationSpecification: {
            type: "PAYMENT_GATEWAY",
            parameters: { gateway: google.gateway, gatewayMerchantId: google.gatewayMerchantId },
          },
        },
      ],
      merchantInfo: { merchantName: google.merchantName, ...(google.merchantId && { merchantId: google.merchantId }) },
      transactionInfo: {
        totalPriceStatus: "FINAL",
        totalPrice: config.amount,
        currencyCode: config.currency,
        countryCode: config.countryCode,
      },
    };

    const onClick = () => {
      const client = googleClient.current;
      if (!client || busyRef.current) return;
      setMessage(null);
      setWorking(true);
      client
        .loadPaymentData(request)
        .then((data) => submit("GOOGLE_PAY", data.paymentMethodData.tokenizationData.token))
        .then((outcome) => go(outcome.next))
        .catch((err: { statusCode?: string }) => {
          setMessage(err?.statusCode === "CANCELED" ? labels.cancelled : labels.unavailable);
          setWorking(false);
        });
    };

    loadGooglePay()
      .then(async () => {
        const api = window.google?.payments?.api;
        if (!api || cancelled) return;
        const client = new api.PaymentsClient({ environment: google.environment });
        const ready = await client.isReadyToPay({ apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods: [card] });
        if (!ready.result || cancelled || !googleBox.current) return;
        googleClient.current = client;
        const button = client.createButton({
          onClick,
          buttonColor: "black",
          buttonType: "pay",
          buttonSizeMode: "fill",
          buttonLocale: locale,
          buttonRadius: 24,
        });
        googleBox.current.replaceChildren(button);
        setGoogleReady(true);
      })
      .catch(() => {
        /* no Google Pay on this device / network: the button is simply not shown */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is static for the page
  }, [google, locale]);

  /* ── Apple Pay ──────────────────────────────────────────────────────── */
  const apple = config.apple;
  const appleReady = useSyncExternalStore(noSubscription, () => !!apple && canUseApplePay(), () => false);

  const appleButtonRef = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return;
    el.style.setProperty("-webkit-appearance", "-apple-pay-button");
    el.style.setProperty("-apple-pay-button-type", "pay");
    el.style.setProperty("-apple-pay-button-style", "black");
  }, []);

  const onApplePay = () => {
    const AP = window.ApplePaySession;
    if (!AP || !apple || busyRef.current) return;
    setMessage(null);
    // Must be created inside the click (user gesture).
    const session = new AP(3, {
      countryCode: apple.countryCode,
      currencyCode: config.currency,
      merchantCapabilities: ["supports3DS"],
      supportedNetworks: apple.networks,
      total: { label: apple.displayName, amount: config.amount, type: "final" },
    });
    let authorized = false;
    session.onvalidatemerchant = (e) => {
      fetch("/api/payments/wallet/apple-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, validationURL: e.validationURL }),
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { session?: unknown }) => session.completeMerchantValidation(d.session))
        .catch(() => {
          session.abort();
          setMessage(labels.unavailable);
          setWorking(false);
        });
    };
    session.onpaymentauthorized = (e) => {
      authorized = true;
      submit("APPLE_PAY", JSON.stringify(e.payment.token)).then((outcome) => {
        session.completePayment({ status: outcome.paid ? AP.STATUS_SUCCESS : AP.STATUS_FAILURE });
        go(outcome.next);
      });
    };
    session.oncancel = () => {
      if (!authorized) setMessage(labels.cancelled);
      setWorking(false);
    };
    setWorking(true);
    session.begin();
  };

  const anyReady = googleReady || appleReady;

  return (
    <div className={anyReady ? "space-y-3" : "hidden"} aria-busy={busy}>
      {apple && appleReady && (
        <button
          ref={appleButtonRef}
          type="button"
          lang={locale}
          onClick={onApplePay}
          disabled={busy}
          aria-label="Apple Pay"
          className="block h-12 w-full cursor-pointer rounded-full disabled:opacity-60"
        />
      )}
      {google && (
        <div
          ref={googleBox}
          className={googleReady ? `h-12 w-full ${busy ? "pointer-events-none opacity-60" : ""}` : "hidden"}
        />
      )}
      {busy && (
        <p role="status" className="text-center text-sm font-semibold text-pizza-muted">
          {labels.processing}
        </p>
      )}
      {message && (
        <p role="alert" className="rounded-2xl bg-pizza-red-light px-4 py-3 text-center text-sm text-brand-dark">
          {message}
        </p>
      )}
      <div className="flex items-center gap-3 pt-1 text-xs font-semibold uppercase tracking-wide text-pizza-muted">
        <span className="h-px flex-1 bg-pizza-line" aria-hidden />
        {labels.separator}
        <span className="h-px flex-1 bg-pizza-line" aria-hidden />
      </div>
    </div>
  );
}
