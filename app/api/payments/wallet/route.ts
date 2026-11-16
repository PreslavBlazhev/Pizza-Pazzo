import { NextResponse, type NextRequest } from "next/server";
import { getStoreStatus } from "@/lib/store-status";
import { payWithWallet } from "@/lib/payments/wallets/service";
import { isWalletType } from "@/lib/payments/wallets/config";
import { MAX_WALLET_DATA } from "@/lib/payments/upc/wallet";
import { clientIp, PAYMENT_RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/payments/wallet — Google Pay / Apple Pay.
 *
 * Body (JSON): { token, locale, wallet: "GOOGLE_PAY" | "APPLE_PAY", walletData }
 * where walletData is the wallet's ENCRYPTED payment data as a string. No
 * amount is accepted: the server charges the stored order total.
 *
 * Answer: { state: "PAID" | "FAILED" | "DECLINED" | "PENDING", next? } or
 * { error: <code> }. The token is never logged, stored or echoed.
 */
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function localePrefix(locale: string): string {
  return locale === "en" ? "/en" : "";
}

export async function POST(request: NextRequest) {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_WALLET_DATA + 2_000) return json({ error: "INVALID_WALLET_DATA" }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: "INVALID_WALLET_DATA" }, 400);
  }
  const token = String(body.token ?? "");
  const locale = body.locale === "en" ? "en" : "bg";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !isWalletType(body.wallet)) {
    return json({ error: "INVALID_WALLET_DATA" }, 400);
  }

  // The same budget as "Плати с карта": each tap may cost two bank calls.
  const ip = clientIp(request.headers);
  if (
    !rateLimit(`pay-start:ip:${ip}`, PAYMENT_RATE_LIMITS.startPerIp) ||
    !rateLimit(`pay-start:order:${token}`, PAYMENT_RATE_LIMITS.startPerOrder)
  ) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const store = await getStoreStatus();
  if (!store.isOpen) return json({ error: "STORE_CLOSED" }, 409);

  const result = await payWithWallet({ accessToken: token, locale, wallet: body.wallet, walletData: body.walletData });
  const q = `?t=${encodeURIComponent(token)}`;
  const page = (path: string) => `${localePrefix(locale)}${path}${q}`;
  if (!result.ok) {
    if (result.code === "ALREADY_PAID") return json({ state: "PAID", next: page("/payment/success") });
    return json({ error: result.code }, result.code === "INVALID_WALLET_DATA" ? 400 : 409);
  }
  const next =
    result.state === "PAID"
      ? page("/payment/success")
      : result.state === "FAILED"
        ? page("/payment/failed")
        : result.state === "PENDING"
          ? page("/payment/pending")
          : null;
  return json({ state: result.state, next });
}
