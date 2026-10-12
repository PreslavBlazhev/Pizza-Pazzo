import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof, carried in the order-success URL, that THIS server just created the
 * order with that number.
 *
 * The confirmation page used to thank anyone for any `?n=`: a page reached by
 * mistake (a stale link, a lost response, a hand-typed URL) said "we received
 * your order" without an order behind it. Now `createOrder` hands back a
 * receipt — an HMAC of the order number keyed from AUTH_SECRET — and the page
 * only says "received" when the receipt matches AND the order exists.
 *
 * Without AUTH_SECRET nothing can be signed, so nothing verifies: the page
 * then shows its neutral "we cannot confirm" text rather than a false thanks.
 */
function key(): string | null {
  const secret = (process.env.AUTH_SECRET ?? "").trim();
  return secret.length >= 16 ? secret : null;
}

export function orderReceipt(orderNumber: number): string | null {
  const k = key();
  if (!k) return null;
  return createHmac("sha256", k).update(`pp-order-receipt:${orderNumber}`).digest("base64url").slice(0, 32);
}

export function isValidOrderReceipt(orderNumber: number, receipt: unknown): boolean {
  if (typeof receipt !== "string" || receipt.length !== 32) return false;
  const expected = orderReceipt(orderNumber);
  if (!expected) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(receipt));
}
