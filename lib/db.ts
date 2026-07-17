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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
