/**
 * The checkout diagnostics (lib/checkout/trace.ts + /api/checkout-trace):
 * only an anonymous id, stage names, the checkout path and the language get
 * through, and they become ONE log line. Anything else — personal data, a
 * token, an unknown stage, another path — is refused and logs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { traceReportSchema } from "@/lib/checkout/trace";
import { POST } from "@/app/api/checkout-trace/route";

const VALID = {
  id: "abc123def456",
  path: "/en/checkout",
  locale: "en",
  stages: [
    { s: "click", ms: 0 },
    { s: "sent", ms: 12 },
    { s: "left", ms: 900 },
  ],
};

async function post(body: unknown, ip = "203.0.113.7"): Promise<{ status: number; logs: string[] }> {
  const logs: string[] = [];
  const orig = console.info;
  console.info = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/checkout-trace", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "x-forwarded-for": ip },
      })
    );
    return { status: res.status, logs };
  } finally {
    console.info = orig;
  }
}

test("schema: a valid trail passes", () => {
  assert.equal(traceReportSchema.safeParse(VALID).success, true);
  assert.equal(traceReportSchema.safeParse({ ...VALID, path: "/checkout", locale: "bg" }).success, true);
});

test("schema: extra fields (personal data, tokens) are refused, not stripped", () => {
  for (const extra of [
    { email: "a@b.c" },
    { customerName: "X" },
    { checkoutKey: "k".repeat(20) },
    { accessToken: "t".repeat(20) },
  ]) {
    assert.equal(traceReportSchema.safeParse({ ...VALID, ...extra }).success, false, JSON.stringify(extra));
  }
  assert.equal(
    traceReportSchema.safeParse({ ...VALID, stages: [{ s: "click", ms: 0, note: "x" }] }).success,
    false
  );
});

test("schema: bad id, path, stage or size is refused", () => {
  for (const bad of [
    { ...VALID, id: "short" },
    { ...VALID, id: "ABC123DEF456" },
    { ...VALID, path: "/admin" },
    { ...VALID, path: "/checkout?n=1" },
    { ...VALID, locale: "de" },
    { ...VALID, stages: [] },
    { ...VALID, stages: [{ s: "typed-card-number", ms: 1 }] },
    { ...VALID, stages: Array.from({ length: 21 }, () => ({ s: "click", ms: 0 })) },
  ]) {
    assert.equal(traceReportSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
  }
});

test("route: a valid trail becomes one log line with the version, and 204", async () => {
  const { status, logs } = await post(VALID);
  assert.equal(status, 204);
  assert.equal(logs.length, 1);
  assert.match(
    logs[0],
    /^\[checkout-trace\] id=abc123def456 version=\S+ locale=en path=\/en\/checkout stages=click@0,sent@12,left@900$/
  );
});

test("route: junk is answered 204 and logs nothing", async () => {
  for (const junk of ["not json", "{}", JSON.stringify({ ...VALID, email: "a@b.c" }), "x".repeat(5000)]) {
    const { status, logs } = await post(junk, "203.0.113.8");
    assert.equal(status, 204);
    assert.equal(logs.length, 0, junk.slice(0, 30));
  }
});

test("route: rate-limited per address", async () => {
  let logged = 0;
  for (let i = 0; i < 25; i++) logged += (await post(VALID, "203.0.113.9")).logs.length;
  assert.equal(logged, 20);
});
