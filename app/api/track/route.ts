import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  TRACK_COOKIE,
  addToTrackCookie,
  findTrackedOrder,
  listTrackedOrders,
  parseTrackCookie,
} from "@/lib/order-tracking";
import { maybePurgeExpiredOrders } from "@/lib/order-purge";
import { nextCutoffAfter, retentionNow } from "@/lib/order-retention";
import { clientIp, rateLimit, TRACKING_RATE_LIMITS } from "@/lib/rate-limit";

/**
 * The customer's order tracking (lib/order-tracking.ts).
 *
 *   GET  /api/track         → this visitor's current orders: the tracking
 *                             cookie + the signed-in account's own orders
 *   POST /api/track {token} → one order by its token (the e-mail link opened
 *                             on any device); on success the token is added
 *                             to this browser's cookie so the home page card
 *                             appears here too
 *
 * Never cached anywhere (no-store), never referred (no-referrer), never
 * logged with a token, rate limited per address. An unknown, forged, foreign
 * or expired token all get the SAME 404 — the answer never tells which.
 */
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

function withoutToken<T extends { token: string }>(o: T): Omit<T, "token"> {
  const copy: Partial<T> = { ...o };
  delete copy.token;
  return copy as Omit<T, "token">;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function setCookie(res: NextResponse, value: string) {
  const now = retentionNow();
  res.cookies.set(TRACK_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // The cookie dies with the orders it points to.
    expires: nextCutoffAfter(now),
  });
}

export async function GET(request: NextRequest) {
  if (!rateLimit(`track:ip:${clientIp(request.headers)}`, TRACKING_RATE_LIMITS.perIp)) {
    return json({ error: "rate_limited" }, 429);
  }
  await maybePurgeExpiredOrders();
  const user = await getSessionUser();
  const tokens = parseTrackCookie(request.cookies.get(TRACK_COOKIE)?.value);
  const orders = await listTrackedOrders(tokens, user?.id ?? null);
  const now = retentionNow();
  // The tokens stay in the HttpOnly cookie: page scripts get the orders, not
  // the credentials (`key` is only a React key).
  const res = json({
    orders: orders.map((o) => ({ ...withoutToken(o), key: `n${o.orderNumber}` })),
    serverTime: now.toISOString(),
    cutoffAt: nextCutoffAfter(now).toISOString(),
  });
  // Forget tokens whose orders are gone, so the cookie never outlives them.
  const live = new Set(orders.map((o) => o.token));
  const kept = tokens.filter((t) => live.has(t));
  if (kept.length !== tokens.length) {
    if (kept.length === 0) res.cookies.delete(TRACK_COOKIE);
    else setCookie(res, kept.join("~"));
  }
  return res;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  if (
    !rateLimit(`track:ip:${ip}`, TRACKING_RATE_LIMITS.perIp) ||
    !rateLimit(`track:lookup:${ip}`, TRACKING_RATE_LIMITS.lookupsPerIp)
  ) {
    return json({ error: "rate_limited" }, 429);
  }
  let token: unknown = null;
  try {
    token = ((await request.json()) as { token?: unknown }).token;
  } catch {
    token = null;
  }
  const user = await getSessionUser();
  const order = await findTrackedOrder(token, user?.id ?? null);
  const now = retentionNow();
  if (!order) return json({ error: "not_found", serverTime: now.toISOString() }, 404);
  const res = json({ order, serverTime: now.toISOString(), cutoffAt: nextCutoffAfter(now).toISOString() });
  setCookie(res, addToTrackCookie(parseTrackCookie(request.cookies.get(TRACK_COOKIE)?.value), order.token));
  return res;
}
