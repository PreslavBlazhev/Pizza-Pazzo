import { NextResponse, type NextRequest } from "next/server";
import { getStoreStatus } from "@/lib/store-status";
import { startCardPayment } from "@/lib/payments/service";
import { getAppBaseUrl } from "@/lib/app-env";

/**
 * POST /api/payments/start — the "Плати с карта" button.
 *
 * A plain HTML form post (it works without JavaScript and inside the Android
 * WebView), answered with a 303 to the provider's hosted page. On any problem
 * the customer goes back to the review screen with an error code, the order
 * and the cart untouched.
 *
 * The body carries only the order's access token and the page locale. The
 * amount is never sent by the browser — startCardPayment reads the stored
 * order total.
 */
export const dynamic = "force-dynamic";

function localePrefix(locale: string): string {
  return locale === "en" ? "/en" : "";
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const locale = form?.get("locale") === "en" ? "en" : "bg";
  const base = getAppBaseUrl() || request.nextUrl.origin;
  const back = (code: string) =>
    NextResponse.redirect(
      `${base}${localePrefix(locale)}/checkout/pay/${encodeURIComponent(token)}?error=${code}`,
      303
    );

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return NextResponse.redirect(`${base}${localePrefix(locale)}/`, 303);
  }

  // The same rule as placing an order: a closed kitchen takes no payments.
  const store = await getStoreStatus();
  if (!store.isOpen) return back("STORE_CLOSED");

  const result = await startCardPayment({ accessToken: token, locale });
  if (result.ok) return NextResponse.redirect(result.redirectUrl, 303);

  if (result.code === "ALREADY_PAID") {
    return NextResponse.redirect(
      `${base}${localePrefix(locale)}/payment/success?t=${encodeURIComponent(token)}`,
      303
    );
  }
  return back(result.code);
}
