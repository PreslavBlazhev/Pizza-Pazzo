import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/app-env";

/**
 * /api/payments/return — where the provider sends the customer's browser
 * back, after success and failure alike.
 *
 * GET and POST: some gateways return with a form POST. Neither is trusted:
 * whatever the provider put in the query or body ("success=true", a status
 * code, an amount) is ignored. The only input used is our own access token,
 * which picks the order; the "checking" page then asks the server, which asks
 * the provider server-to-server.
 *
 * The customer lands on a page in the language they paid in.
 */
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  let token = request.nextUrl.searchParams.get("t") ?? "";
  if (!token && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("t") ?? "");
  }
  const base = getAppBaseUrl() || request.nextUrl.origin;

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return NextResponse.redirect(`${base}/`, 303);
  }

  const order = await db.order.findUnique({ where: { accessToken: token }, select: { id: true } });
  const latest = order
    ? await db.paymentAttempt.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
        select: { locale: true },
      })
    : null;
  const prefix = latest?.locale === "en" ? "/en" : "";

  // 303: after a POST the browser must follow with a GET.
  return NextResponse.redirect(
    `${base}${prefix}/payment/return?t=${encodeURIComponent(token)}`,
    303
  );
}

export const GET = handle;
export const POST = handle;
