/**
 * Which deployment this process is, and where it is publicly reachable.
 * Dependency-free — read by middleware (Edge), server code and the tests.
 *
 * APP_ENV is deliberately separate from NODE_ENV: a staging server on Render
 * runs `next start`, so NODE_ENV is "production" there too, and NODE_ENV alone
 * cannot tell "the real restaurant" from "the copy we test on".
 *
 * ⚠️ The default is the SAFE one. A server without APP_ENV that runs a
 * production build is treated as production, so everything that must never
 * happen with real customers (the payment simulator, bank sandboxes) stays off
 * unless someone explicitly says this is not production.
 */

export const APP_ENVS = ["development", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export function getAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const raw = (env.APP_ENV ?? "").trim().toLowerCase();
  if ((APP_ENVS as readonly string[]).includes(raw)) return raw as AppEnv;
  return env.NODE_ENV === "production" ? "production" : "development";
}

/** Strips trailing slashes; returns "" for an empty or unparsable value. */
export function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    // Only the origin (+ an optional base path) — never a query or fragment.
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

/**
 * THE public address of this deployment — e.g. "https://pizza-pazzo.onrender.com"
 * today and the new ".com" domain later. Every absolute URL the server builds
 * (canonical/OG metadata, sitemap, the payment return and callback addresses)
 * comes from here, so moving to a new domain is one environment variable.
 *
 * APP_BASE_URL is the variable to set. NEXT_PUBLIC_SITE_URL is still honoured
 * as a fallback, because existing deployments already have it.
 */
export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeBaseUrl(env.APP_BASE_URL) || normalizeBaseUrl(env.NEXT_PUBLIC_SITE_URL);
}
