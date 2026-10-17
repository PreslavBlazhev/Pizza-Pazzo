import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredOrders } from "@/lib/order-purge";
import { drainEmailOutbox } from "@/lib/email/outbox";
import { retryFailedNotifications } from "@/lib/payments/service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/maintenance/run — the scheduled job: the 22:30 purge of expired
 * orders (lib/order-purge.ts), the customer e-mail outbox and the restaurant
 * e-mail retries. For a Render Cron Job (or any scheduler), e.g. every 5
 * minutes:
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $MAINTENANCE_SECRET" \
 *        https://pizzapazzo.bg/api/maintenance/run
 *
 * A Render Cron Job cannot mount the web service's disk, so it calls the web
 * service instead of touching the SQLite file. Every step is idempotent: a
 * run twice, two runs at once or a run hours late all end in the same state.
 * The scheduler is the PRIMARY trigger; the kitchen poll, the tracking API
 * and the server start run the purge too (maybePurgeExpiredOrders), and the
 * retention filter in lib/db.ts hides expired orders at 22:30:00 whatever
 * the scheduler does.
 *
 * Fail-closed: without MAINTENANCE_SECRET (≥ 32 characters) the endpoint does
 * not exist (404). The answer carries counts only.
 */
export const dynamic = "force-dynamic";

const MIN_SECRET = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export async function POST(request: NextRequest) {
  const secret = (process.env.MAINTENANCE_SECRET ?? "").trim();
  if (secret.length < MIN_SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!rateLimit(`maintenance:ip:${clientIp(request.headers)}`, { limit: 12, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !timingSafeEqual(digest(given), digest(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const purge = await purgeExpiredOrders();
  const outbox = await drainEmailOutbox({ limit: 20 });
  const restaurantRetried = await retryFailedNotifications().catch(() => 0);
  return NextResponse.json(
    { ok: true, purge, outbox, restaurantRetried },
    { headers: { "Cache-Control": "no-store" } }
  );
}
