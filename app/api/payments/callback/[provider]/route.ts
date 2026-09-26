import { type NextRequest } from "next/server";
import { handleProviderCallback } from "@/lib/payments/service";

/**
 * /api/payments/callback/{provider} — server-to-server notifications.
 *
 * It arrives independently of the customer: the browser may never come back
 * (closed tab, killed app), and this is how the order still gets paid and
 * sent to the kitchen. It is only a hint — handleProviderCallback verifies it
 * as the provider's protocol requires and then asks the provider for the real
 * status. GET and POST are both accepted because gateways differ.
 *
 * This path must stay reachable without a login or staging password; see
 * middleware.ts, which never touches /api.
 */
export const dynamic = "force-dynamic";

async function handle(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const bodyText = request.method === "POST" ? await request.text().catch(() => "") : "";
  const outcome = await handleProviderCallback(provider, {
    method: request.method,
    headers: request.headers,
    query: request.nextUrl.searchParams,
    bodyText: bodyText.slice(0, 20_000),
  });
  return new Response(outcome.body, {
    status: outcome.status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const GET = handle;
export const POST = handle;
