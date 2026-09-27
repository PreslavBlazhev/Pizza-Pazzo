/**
 * Card-payment DEMO on the live site — SERVER ONLY.
 *
 * The owner wants to try the whole card flow on the real site before a bank
 * is chosen. The environment configuration (lib/payments/config.ts) still
 * refuses the simulator in production — deliberately, so a forgotten env var
 * can never turn it on. This is a separate, visible switch kept in the
 * database and flipped from Admin → Settings:
 *
 *   OFF       no demo (card appears only if a real provider is configured)
 * Live site: EVERYONE since 2026-09-27 (migration 20260927140000).
 *
 *   STAFF     the demo card option is shown only to signed-in STAFF / ADMIN /
 *             SUPER_ADMIN — customers never see it
 *   EVERYONE  every visitor sees it (orders paid this way are still TEST
 *             orders and are never cooked)
 *
 * A real, configured provider (bank in production) always wins over the demo.
 * Everything paid through the demo is a test order: "ТЕСТ — НЕ ПРИГОТВЯЙ" on
 * the board and the tickets, no e-mails, excluded from revenue.
 */
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { getAppBaseUrl, getAppEnv, normalizeBaseUrl } from "@/lib/app-env";
import type { PaymentConfig } from "./config";
import { isCardDemoMode, type CardDemoMode } from "./demo-modes";

export { CARD_DEMO_MODES, CARD_DEMO_MODE_LABELS, isCardDemoMode, type CardDemoMode } from "./demo-modes";

const STAFF_ROLES = ["STAFF", "ADMIN", "SUPER_ADMIN"];

/** The current switch; OFF when the row or the database cannot be read. */
export async function getCardDemoMode(): Promise<CardDemoMode> {
  try {
    const row = await db.restaurantSettings.findUnique({
      where: { id: "restaurant" },
      select: { cardDemoMode: true },
    });
    return isCardDemoMode(row?.cardDemoMode) ? row.cardDemoMode : "OFF";
  } catch {
    return "OFF";
  }
}

/** May this viewer (role, or null for a guest) see the demo card option? */
export function demoAllowsViewer(mode: CardDemoMode, role: string | null | undefined): boolean {
  if (mode === "EVERYONE") return true;
  if (mode === "STAFF") return !!role && STAFF_ROLES.includes(role);
  return false;
}

/**
 * The simulator configuration the demo runs on. Needs nothing from Render:
 *   - the public address: APP_BASE_URL / NEXT_PUBLIC_SITE_URL, else Render's
 *     own RENDER_EXTERNAL_URL;
 *   - the callback-signing secret: PAYMENT_SIMULATOR_SECRET, else derived
 *     from AUTH_SECRET (HMAC with a fixed label, so it is stable across
 *     restarts and never equal to AUTH_SECRET itself).
 */
export function demoSimulatorConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const problems: string[] = [];
  const baseUrl = getAppBaseUrl(env) || normalizeBaseUrl(env.RENDER_EXTERNAL_URL);
  if (!baseUrl) problems.push("Няма публичен адрес (APP_BASE_URL или RENDER_EXTERNAL_URL).");

  const explicit = (env.PAYMENT_SIMULATOR_SECRET ?? "").trim();
  const auth = (env.AUTH_SECRET ?? "").trim();
  const simulatorSecret =
    explicit.length >= 16
      ? explicit
      : auth.length >= 16
        ? createHmac("sha256", auth).update("pp-card-demo-simulator").digest("hex")
        : "";
  if (!simulatorSecret) problems.push("Няма PAYMENT_SIMULATOR_SECRET или AUTH_SECRET.");

  return {
    enabled: problems.length === 0,
    problems,
    appEnv: getAppEnv(env),
    providerId: "simulator",
    environment: "simulator",
    currency: "EUR",
    baseUrl,
    isTest: true,
    simulatorSecret,
  };
}

