/**
 * Apple Pay domain verification file, served at
 * /.well-known/apple-developer-merchantid-domain-association (rewrite in
 * next.config.ts). The content is the file Apple gives for OUR merchant id
 * (plain ASCII text), pasted as is into APPLE_PAY_DOMAIN_ASSOCIATION.
 * 404 while it is not set.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const body = (process.env.APPLE_PAY_DOMAIN_ASSOCIATION ?? "").trim();
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
