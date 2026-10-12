import { NextResponse, type NextRequest } from "next/server";
import { traceReportSchema } from "@/lib/checkout/trace";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/checkout-trace — one log line per checkout attempt that the
 * browser left unfinished (see lib/checkout/trace.ts). Nothing is stored;
 * the line goes to the server log (Render → Logs), next to the
 * "[checkout] …" lines of the same minute.
 *
 * Only the strict schema passes: a random id, stage names, the checkout path
 * and the language. The app version is added here, from the server.
 */
export const dynamic = "force-dynamic";

const LIMIT = { limit: 20, windowMs: 10 * 60_000 };

export async function POST(request: NextRequest) {
  if (!rateLimit(`checkout-trace:${clientIp(request.headers)}`, LIMIT)) {
    return new NextResponse(null, { status: 204 });
  }
  const text = await request.text().catch(() => "");
  if (text.length > 4000) return new NextResponse(null, { status: 204 });
  let parsed;
  try {
    parsed = traceReportSchema.safeParse(JSON.parse(text));
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (parsed.success) {
    const r = parsed.data;
    const version = (process.env.RENDER_GIT_COMMIT ?? "local").slice(0, 7);
    console.info(
      `[checkout-trace] id=${r.id} version=${version} locale=${r.locale} path=${r.path} stages=${r.stages
        .map((s) => `${s.s}@${s.ms}`)
        .join(",")}`
    );
  }
  return new NextResponse(null, { status: 204 });
}
