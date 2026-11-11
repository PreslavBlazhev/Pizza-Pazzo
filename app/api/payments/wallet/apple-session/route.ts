import { NextResponse, type NextRequest } from "next/server";
import { walletOfferForToken } from "@/lib/payments/wallets/service";
import { isAppleValidationUrl, requestAppleMerchantSession } from "@/lib/payments/wallets/apple-session";
import { clientIp, PAYMENT_RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/payments/wallet/apple-session — Apple Pay merchant validation.
 *
 * Body (JSON): { token, validationURL }. Answers Apple's opaque merchant
 * session for completeMerchantValidation, or an error. Only for an order
 * that may be paid with Apple Pay right now, and only to Apple's own
 * validation hosts.
 */
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 2_000) return json({ error: "BAD_REQUEST" }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const token = String(body.token ?? "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !isAppleValidationUrl(body.validationURL)) {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const ip = clientIp(request.headers);
  if (
    !rateLimit(`apple-session:ip:${ip}`, PAYMENT_RATE_LIMITS.startPerIp) ||
    !rateLimit(`apple-session:order:${token}`, PAYMENT_RATE_LIMITS.startPerOrder)
  ) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const offer = await walletOfferForToken(token);
  if (!offer?.wallets.apple) return json({ error: "DISABLED" }, 409);
  const session = await requestAppleMerchantSession(offer.wallets.apple, body.validationURL);
  if (!session) return json({ error: "VALIDATION_FAILED" }, 502);
  return json({ session });
}
