import { handleUpcNotify } from "@/lib/payments/upc/notify";

/**
 * NOTIFY_URL for ОББ's UPC terminal — POST from UPC's gateway, server to
 * server. No session, no cookie, no CAPTCHA, no CSRF token: the proxy never
 * runs on /api, and the request is authenticated by UPC's RSA signature
 * (verified with the pinned gateway certificate in handleUpcNotify).
 *
 * The answer is the plain-text "Parameter=Value" lines UPC's protocol
 * prescribes, with Response.action=approve|reverse — always HTTP 200, because
 * the decision is in the body; any other status counts as a failed NOTIFY.
 * A message that cannot be verified gets NO decision: HTTP 503, no
 * Response.action (lib/payments/upc/notify.ts).
 */
export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = (await request.text().catch(() => "")).slice(0, 20_000);
  try {
    const outcome = await handleUpcNotify(body);
    // An unverifiable message gets no decision: a failed NOTIFY, not "reverse".
    return new Response(outcome.body, { status: outcome.action === "none" ? 503 : 200, headers: HEADERS });
  } catch (err) {
    // A database outage, say. Not a 200: UPC must not read silence as an
    // answer — its portal setting decides what happens to the transaction.
    console.error(`[payments] UPC notify failed: ${(err as Error).message}`);
    return new Response("temporarily unavailable\n", { status: 503, headers: HEADERS });
  }
}

export async function GET() {
  return new Response("NOTIFY_URL accepts POST from the payment gateway only.\n", {
    status: 405,
    headers: { ...HEADERS, Allow: "POST" },
  });
}
