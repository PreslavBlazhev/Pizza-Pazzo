"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import {
  APP_ANALYTICS_CONSENT_EVENT,
  appAnalyticsConsent,
  isAppAnalyticsEnabled,
  openAppAnalyticsSettings,
  trackAppEvent,
  trackAppPurchase,
  type AppAnalyticsConsent,
  type AppAnalyticsEvent,
  type PurchaseParams,
} from "@/lib/app-analytics";

/**
 * React glue for the Android app's analytics (lib/app-analytics.ts). Every
 * component here renders nothing — or nothing outside the app — and does
 * nothing in an ordinary browser.
 */

/** Reports one event when the page mounts — once, however often it renders. */
export function TrackAppEvent({ name, params }: { name: AppAnalyticsEvent; params: object | null }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !params) return;
    sent.current = true;
    trackAppEvent(name, params);
  }, [name, params]);
  return null;
}

/**
 * Reports a purchase. `params` is null when the order must not be reported
 * (see purchaseParams) — the server decides, never the URL.
 */
export function TrackAppPurchase({ params }: { params: PurchaseParams | null }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !params) return;
    sent.current = true;
    trackAppPurchase(params);
  }, [params]);
  return null;
}

/** Name of the one-shot cookie — mirrors lib/app-analytics-signal.ts (server). */
const SIGNAL_COOKIE = "pp_app_signal";

/**
 * Picks up "login / sign_up just succeeded", left by the auth actions for the
 * page after their redirect, reports it and deletes it. Mounted once in the
 * layout; checks on every route change.
 */
export function AppAnalyticsSignals() {
  const pathname = usePathname();
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${SIGNAL_COOKIE}=([^;]*)`));
    if (!match) return;
    document.cookie = `${SIGNAL_COOKIE}=; path=/; max-age=0; samesite=lax`;
    const event = match[1];
    if (event === "login" || event === "sign_up") trackAppEvent(event, { method: "password" });
  }, [pathname]);
  return null;
}

/**
 * Hidden form field telling an auth action to leave that signal — present
 * only inside the app, with consent. Outside it the field is empty and the
 * action does nothing extra.
 */
export function AppAnalyticsFormField() {
  const enabled = useSyncExternalStore(subscribeToConsent, isAppAnalyticsEnabled, () => false);
  return enabled ? <input type="hidden" name="appAnalytics" value="1" /> : null;
}

/** The app announces consent changes as a window event. */
function subscribeToConsent(onChange: () => void): () => void {
  window.addEventListener(APP_ANALYTICS_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(APP_ANALYTICS_CONSENT_EVENT, onChange);
}

/**
 * "Usage statistics in the app — change your choice", for the app-privacy
 * page. Opens the app's own consent dialog, which is where consent is given
 * and withdrawn. Shown only inside the app.
 */
export function AppAnalyticsConsentButton() {
  const t = useTranslations("legal");
  const state = useSyncExternalStore<AppAnalyticsConsent>(
    subscribeToConsent,
    appAnalyticsConsent,
    () => "unavailable"
  );

  if (state === "unavailable") return null;

  const current =
    state === "granted"
      ? t("appAnalyticsGranted")
      : state === "denied"
        ? t("appAnalyticsDenied")
        : t("appAnalyticsUnknown");

  return (
    <section className="mx-auto mb-8 max-w-3xl rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-bold text-pizza-ink">{t("appAnalyticsTitle")}</h2>
      <p className="mt-2 text-pizza-muted">{current}</p>
      <button
        type="button"
        onClick={openAppAnalyticsSettings}
        className="mt-4 rounded-full bg-brand px-6 py-3 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
      >
        {t("appAnalyticsButton")}
      </button>
    </section>
  );
}
