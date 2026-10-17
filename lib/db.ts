/**
 * Prisma client singleton — SERVER ONLY.
 *
 * ⚠️ Never import this from a Client Component. It touches the SQLite database
 * directly and must only run on the server (Server Components, Route Handlers,
 * Server Actions).
 *
 * In development Next.js hot-reloads modules on every change; without the
 * `globalThis` cache each reload would spin up a brand-new PrismaClient and
 * exhaust the database connections. We keep a single instance on `globalThis`
 * across reloads. In production a fresh instance per process is what we want.
 */
import { PrismaClient } from "@prisma/client";
import { lastCutoffAtOrBefore, orderRetentionEnabled, retentionNow } from "@/lib/order-retention";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// SQLite has one writer. Prisma 5 can deadlock its engine on small Linux
// runners when several interactive transactions wait for that writer at
// once. Queue them in the connection pool instead of blocking engine workers.
// Preserve the database path and all other URL parameters; never log the URL.
const databaseUrl = process.env.DATABASE_URL;
const sqliteUrl = databaseUrl?.startsWith("file:")
  ? (() => {
      const queryStart = databaseUrl.indexOf("?");
      const path = queryStart < 0 ? databaseUrl : databaseUrl.slice(0, queryStart);
      const params = new URLSearchParams(queryStart < 0 ? "" : databaseUrl.slice(queryStart + 1));
      params.set("connection_limit", "1");
      return `${path}?${params}`;
    })()
  : undefined;

const base =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(sqliteUrl ? { datasources: { db: { url: sqliteUrl } } } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;

// ── Daily retention (lib/order-retention.ts) — SWITCHED OFF ────────────────
//
// The order history is kept (owner, 2026-10-17): while
// orderRetentionEnabled() is false — always, outside the tests of the
// dormant design — the hook below passes every query through UNCHANGED, so
// old orders stay visible in the history, the admin and the reports.
//
// When it is ON (a deliberate code change), this is what it does:
// Every query of an order, or of a row that belongs to one, is limited to
// orders placed after the last 22:30 Europe/Sofia. That is the server-side
// guarantee that a late purge job cannot be seen: from 22:30:00 the order
// cannot be read, updated, printed, paid, tracked or e-mailed — the query
// simply finds nothing — even while its row still waits for the DELETE.
//
// `create` is not filtered: placing an order checks the cutoff inside its own
// transaction (lib/checkout/place-order.ts). A child row (payment attempt,
// audit event, refund, e-mail job) is only ever created by code that first
// READ its order through this filter, so a late retry or webhook finds no
// order and creates nothing; and once the purge ran, the foreign key makes
// attaching anything to a deleted order impossible. Nothing can re-create an
// order: no code path inserts an Order except checkout.
//
// Only lib/order-purge.ts and the order-number counter use `dbUnscoped`.

const FILTERED_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

function liveOrderFilter(): { createdAt: { gt: Date } } {
  return { createdAt: { gt: lastCutoffAtOrBefore(retentionNow()) } };
}

/** ANDs `extra` into a where clause, keeping it valid as a WhereUniqueInput. */
function withAnd<T extends Record<string, unknown> | undefined>(where: T, extra: object): T {
  const current = (where ?? {}) as Record<string, unknown>;
  const and = current.AND === undefined ? [] : Array.isArray(current.AND) ? current.AND : [current.AND];
  return { ...current, AND: [...and, extra] } as unknown as T;
}

type QueryArgs = { where?: Record<string, unknown> };

function scopeToLiveOrder(viaRelation: boolean) {
  return async ({
    operation,
    args,
    query,
  }: {
    operation: string;
    args: unknown;
    query: (args: unknown) => Promise<unknown>;
  }) => {
    // History kept: nothing is hidden.
    if (!orderRetentionEnabled()) return query(args);
    const a = (args ?? {}) as QueryArgs;
    if (FILTERED_OPERATIONS.has(operation)) {
      const filter = viaRelation ? { order: liveOrderFilter() } : liveOrderFilter();
      return query({ ...a, where: withAnd(a.where, filter) });
    }
    return query(args);
  };
}

export const db = base.$extends({
  name: "daily-order-retention",
  query: {
    order: { $allOperations: scopeToLiveOrder(false) },
    orderItem: { $allOperations: scopeToLiveOrder(true) },
    paymentAttempt: { $allOperations: scopeToLiveOrder(true) },
    paymentAuditEvent: { $allOperations: scopeToLiveOrder(true) },
    paymentRefundRecord: { $allOperations: scopeToLiveOrder(true) },
    emailOutbox: { $allOperations: scopeToLiveOrder(true) },
  },
});

/**
 * The client WITHOUT the retention filter. Only for the purge (it must see
 * expired rows to delete them) and for tables that hold no order data.
 */
export const dbUnscoped = base;

export type DbClient = typeof db;
export type DbTransaction = Parameters<Parameters<DbClient["$transaction"]>[0]>[0];
