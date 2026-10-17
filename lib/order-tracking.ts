/**
 * Order tracking — SERVER ONLY. Who may see an order's status, and what they see.
 *
 * ACCESS
 *   - A signed-in customer sees their own orders (ownership by userId).
 *   - Anyone else needs the order's tracking token. The order number is NOT
 *     a credential: numbers are sequential and guessable.
 *
 * THE TOKEN is `<order id>.<HMAC-SHA256(AUTH_SECRET, "pp-track:v1:<id>")>`
 * (256-bit MAC, base64url). Nothing is stored: the server re-derives the MAC
 * and compares in constant time, so there is no token column to leak, and the
 * token stops working the moment its order is gone — at 22:30 with the
 * purge, or a second earlier for everyone through the retention filter in
 * lib/db.ts. Without AUTH_SECRET nothing is issued and nothing verifies.
 *
 * WHERE IT TRAVELS
 *   - an HttpOnly cookie (pp_track) set at checkout, expiring at 22:30, so
 *     the home page can show "Проследи своята поръчка" without the token
 *     ever being readable by page scripts or stored in localStorage;
 *   - the e-mail's button, as the URL FRAGMENT (/track#t=…): a fragment is
 *     never sent to the server, so it is not in access logs, never in a
 *     Referer header, and the page answers with no-referrer anyway.
 *
 * WHAT IS RETURNED (TrackedOrder): number, status, delivery method, times and
 * the estimate — no name, address, phone, e-mail, items or staff notes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { orderExpiresAt } from "@/lib/order-retention";
import { SITE_URL } from "@/lib/constants";
import {
  isDeliveryMethod,
  isOrderStatus,
  type DeliveryMethod,
  type OrderStatus,
} from "@/types/order";

const TOKEN_RE = /^([a-z0-9]{20,40})\.([A-Za-z0-9_-]{43})$/;

function key(): string | null {
  const secret = (process.env.AUTH_SECRET ?? "").trim();
  return secret.length >= 16 ? secret : null;
}

function mac(orderId: string, k: string): string {
  return createHmac("sha256", k).update(`pp-track:v1:${orderId}`).digest("base64url");
}

/** The tracking token of an order, or null when AUTH_SECRET is missing. */
export function trackingTokenFor(orderId: string): string | null {
  const k = key();
  return k ? `${orderId}.${mac(orderId, k)}` : null;
}

/** The order id a token proves access to, or null for anything forged/malformed. */
export function verifyTrackingToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 100) return null;
  const m = TOKEN_RE.exec(token);
  const k = key();
  if (!m || !k) return null;
  const expected = Buffer.from(mac(m[1], k));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? m[1] : null;
}

/** The public tracking address carrying the token in the fragment. */
export function trackingUrlFor(orderId: string, locale: "bg" | "en" = "bg"): string | null {
  const token = trackingTokenFor(orderId);
  if (!token) return null;
  const base = SITE_URL.replace(/\/+$/, "");
  return `${base}${locale === "en" ? "/en" : ""}/track#t=${token}`;
}

/** Everything the tracking page and the home card get — and nothing more. */
export interface TrackedOrder {
  /** Opaque handle the page uses to refresh one order (its token). */
  token: string;
  orderNumber: number;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  createdAt: string;
  acceptedAt: string | null;
  estimatedTimeMinutes: number | null;
  /** When staff last changed anything on the order. */
  updatedAt: string;
  /** 22:30 of the order's day: the page clears itself then. */
  expiresAt: string;
  isTest: boolean;
}

const TRACKED_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  deliveryMethod: true,
  createdAt: true,
  acceptedAt: true,
  estimatedTimeMinutes: true,
  updatedAt: true,
  isTest: true,
  userId: true,
  releasedToKitchenAt: true,
} as const;

type TrackedRow = {
  id: string;
  orderNumber: number;
  status: string;
  deliveryMethod: string;
  createdAt: Date;
  acceptedAt: Date | null;
  estimatedTimeMinutes: number | null;
  updatedAt: Date;
  isTest: boolean;
  userId: string | null;
  releasedToKitchenAt: Date | null;
};

function toTracked(row: TrackedRow): TrackedOrder | null {
  const token = trackingTokenFor(row.id);
  if (!token) return null;
  return {
    token,
    orderNumber: row.orderNumber,
    status: isOrderStatus(row.status) ? row.status : "PENDING",
    deliveryMethod: isDeliveryMethod(row.deliveryMethod) ? row.deliveryMethod : "DELIVERY",
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    estimatedTimeMinutes: row.estimatedTimeMinutes,
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: orderExpiresAt(row.createdAt).toISOString(),
    isTest: row.isTest,
  };
}

/**
 * The order behind a token, if the viewer may see it:
 *   - the token must verify and the order must still exist (live);
 *   - an order that belongs to an account is shown to that account, or to a
 *     visitor who is NOT signed in (the e-mail link on another device). A
 *     DIFFERENT signed-in account is refused even with the token.
 */
export async function findTrackedOrder(
  token: unknown,
  viewerUserId: string | null
): Promise<TrackedOrder | null> {
  const orderId = verifyTrackingToken(token);
  if (!orderId) return null;
  const row = await db.order.findUnique({ where: { id: orderId }, select: TRACKED_SELECT });
  if (!row) return null;
  if (row.userId && viewerUserId && row.userId !== viewerUserId) return null;
  return toTracked(row);
}

/** Max orders one browser keeps in its tracking cookie. */
export const MAX_TRACKED_ORDERS = 5;

/**
 * The current orders of this visitor: the ones in their tracking cookie plus,
 * when signed in, every live order of their account. Newest first, no
 * duplicates. Card orders still waiting for payment are included — their
 * status is "sent, awaiting confirmation" like any other.
 */
export async function listTrackedOrders(
  cookieTokens: readonly string[],
  viewerUserId: string | null
): Promise<TrackedOrder[]> {
  const ids = new Set<string>();
  for (const t of cookieTokens.slice(0, MAX_TRACKED_ORDERS)) {
    const id = verifyTrackingToken(t);
    if (id) ids.add(id);
  }
  const rows = await db.order.findMany({
    where: {
      OR: [
        ...(ids.size > 0 ? [{ id: { in: [...ids] } }] : []),
        ...(viewerUserId ? [{ userId: viewerUserId }] : []),
      ],
    },
    select: TRACKED_SELECT,
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows
    .filter((r) => !(r.userId && viewerUserId && r.userId !== viewerUserId))
    .filter((r) => ids.has(r.id) || r.userId === viewerUserId)
    .map(toTracked)
    .filter((o): o is TrackedOrder => o !== null);
}

// ── The cookie (pp_track) ───────────────────────────────────────────────────

export const TRACK_COOKIE = "pp_track";

/** Parses the cookie value into well-formed tokens (bad entries dropped). */
export function parseTrackCookie(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split("~")
    .filter((t) => TOKEN_RE.test(t))
    .slice(0, MAX_TRACKED_ORDERS);
}

/** Adds a token (newest first, capped, de-duplicated). */
export function addToTrackCookie(current: readonly string[], token: string): string {
  return [token, ...current.filter((t) => t !== token)].slice(0, MAX_TRACKED_ORDERS).join("~");
}
