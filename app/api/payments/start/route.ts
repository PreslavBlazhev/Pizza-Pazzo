import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getStoreStatus } from "@/lib/store-status";
import { startCardPayment } from "@/lib/payments/service";
import { buildAutoPostPage } from "@/lib/payments/hosted-form";
import { getAppBaseUrl } from "@/lib/app-env";
import { clientIp, PAYMENT_RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

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

  // Each click may cost a call to the bank: bounded per address and per order.
  const ip = clientIp(request.headers);
  if (
    !rateLimit(`pay-start:ip:${ip}`, PAYMENT_RATE_LIMITS.startPerIp) ||
    !rateLimit(`pay-start:order:${token}`, PAYMENT_RATE_LIMITS.startPerOrder)
  ) {
    return back("RATE_LIMITED");
  }

  // The same rule as placing an order: a closed kitchen takes no payments.
  const store = await getStoreStatus();
  if (!store.isOpen) return back("STORE_CLOSED");

  const result = await startCardPayment({ accessToken: token, locale });
  if (result.ok) {
    const { redirect } = result;
    if (!redirect.postFields) return NextResponse.redirect(redirect.url, 303);
    // The gateway wants the signed request POSTed by the browser.
    const page = buildAutoPostPage({
      url: redirect.url,
      fields: redirect.postFields,
      locale,
      nonce: randomBytes(16).toString("base64"),
    });
    return new NextResponse(page.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": page.csp,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (result.code === "ALREADY_PAID") {
    return NextResponse.redirect(
      `${base}${localePrefix(locale)}/payment/success?t=${encodeURIComponent(token)}`,
      303
    );
  }
  return back(result.code);
}
