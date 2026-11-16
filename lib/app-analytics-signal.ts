/**
 * "A login / sign-up just succeeded" — carried across the redirect for the
 * Android app's analytics (lib/app-analytics.ts). SERVER ONLY.
 *
 * The auth actions end in a server-side redirect, so the page that submitted
 * the form never learns that it worked. The form adds `appAnalytics=1` only
 * when it runs inside the app WITH the user's analytics consent; then, and
 * only then, the action leaves this one-word cookie for the next page, where
 * <AppAnalyticsSignals /> reports the event and deletes it.
 *
 * It holds the event name and nothing else — no id, no e-mail — lives two
 * minutes, and never exists in an ordinary browser.
 */
import { cookies } from "next/headers";

export const APP_ANALYTICS_SIGNAL_COOKIE = "pp_app_signal";
export const APP_ANALYTICS_FORM_FIELD = "appAnalytics";

export async function signalAppAuthEvent(
  formData: FormData,
  event: "login" | "sign_up"
): Promise<void> {
  if (formData.get(APP_ANALYTICS_FORM_FIELD) !== "1") return;
  try {
    (await cookies()).set(APP_ANALYTICS_SIGNAL_COOKIE, event, {
      path: "/",
      maxAge: 120,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Read (and deleted) by client-side JavaScript on purpose.
      httpOnly: false,
    });
  } catch {
    /* analytics must never break a login */
  }
}
