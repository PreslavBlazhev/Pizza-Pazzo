import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredOrders } from "@/lib/order-purge";
import { drainEmailOutbox } from "@/lib/email/outbox";
import { retryFailedNotifications } from "@/lib/payments/service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/maintenance/run?trigger=cutoff|fallback — the scheduled job: the
 * 22:30 purge of expired orders (lib/order-purge.ts), the customer e-mail
 * outbox and the restaurant e-mail retries. Two Render Cron Jobs call it
 * (render.yaml):
 *
 *   cutoff   — "30 19,20 * * *" UTC = 22:30 Sofia in summer (19:30 UTC) and
 *              in winter (20:30 UTC); the other of the two is a harmless
 *              extra run an hour off;
 *   fallback — "*\/5 * * * *", catching a missed or failed cutoff run.
 *
 * A Render Cron Job cannot mount the web service's disk, so it calls the web
 * service. Every step is idempotent. The answer is 200 only when everything
 * succeeded and 500 when anything failed (a backup that could not be
 * cleaned, the live database), so the scheduler marks the run as FAILED and
 * the failure is visible there as well as in MaintenanceState.
 *
 * Exact UNAVAILABILITY at 22:30 does not depend on this endpoint (lib/db.ts);
 * the time of PHYSICAL deletion does, and each run records it.
 *
 * Fail-closed: without MAINTENANCE_SECRET (≥ 32 characters) the endpoint does
 * not exist (404). The answer carries counts, times and file names only.
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

  const raw = request.nextUrl.searchParams.get("trigger");
  const trigger = raw === "cutoff" || raw === "fallback" ? raw : "manual";
  const purge = await purgeExpiredOrders(undefined, { trigger });
  const outbox = await drainEmailOutbox({ limit: 20 });
  const restaurantRetried = await retryFailedNotifications().catch(() => 0);
  return NextResponse.json(
    { ok: purge.ok, purge, outbox, restaurantRetried },
    { status: purge.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } }
  );
}
