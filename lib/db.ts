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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(sqliteUrl ? { datasources: { db: { url: sqliteUrl } } } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
