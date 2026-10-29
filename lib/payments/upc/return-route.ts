import { NextResponse, type NextRequest } from "next/server";
import { getAppBaseUrl } from "@/lib/app-env";
import { clientIp, PAYMENT_RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { resolveUpcBrowserReturn } from "./browser-return";

/**
 * The shared handler of SUCCESS_URL and FAILURE_URL (app/api/payments/upc/*).
 * UPC sends the customer's browser back with a form POST; this never marks
 * anything paid — it checks UPC's signature, asks the gateway
 * server-to-server and forwards the browser (303) to the "checking your
 * payment" page. See ./browser-return.ts.
 */
export function upcReturnHandler(kind: "success" | "failure") {
  return async function handle(request: NextRequest) {
    const base = getAppBaseUrl() || request.nextUrl.origin;
    if (!rateLimit(`pay-upc-return:ip:${clientIp(request.headers)}`, PAYMENT_RATE_LIMITS.statusPerIp)) {
      return NextResponse.redirect(`${base}/payment/return`, 303);
    }
    const raw =
      request.method === "POST"
        ? (await request.text().catch(() => "")).slice(0, 20_000)
        : request.nextUrl.searchParams.toString();
    const target = await resolveUpcBrowserReturn(kind, raw);
    return NextResponse.redirect(`${base}${target.path}`, 303);
  };
}
