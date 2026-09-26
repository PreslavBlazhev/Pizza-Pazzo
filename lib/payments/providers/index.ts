/**
 * Provider registry — SERVER ONLY. The one place that turns configuration
 * into a concrete adapter. Returns null whenever card payments are off, so
 * callers cannot reach a provider the configuration did not approve.
 */
import { getPaymentConfig, type PaymentConfig } from "../config";
import type { PaymentProvider } from "../types";
import { bankConfigProblems, createBankProvider, BANK_PROVIDER_ID } from "./bank";
import { createSimulatorProvider, SIMULATOR_PROVIDER_ID } from "./simulator";

/** Config plus the chosen adapter's own requirements. */
export function getEffectivePaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const config = getPaymentConfig(env);
  if (config.providerId === "bank") {
    const extra = bankConfigProblems();
    if (extra.length > 0) {
      return { ...config, enabled: false, problems: [...config.problems, ...extra] };
    }
  }
  return config;
}

/** The adapter for NEW payments, or null when card payments are off. */
export function getActivePaymentProvider(
  env: NodeJS.ProcessEnv = process.env
): PaymentProvider | null {
  const config = getEffectivePaymentConfig(env);
  if (!config.enabled) return null;
  return config.providerId === "simulator"
    ? createSimulatorProvider(config)
    : createBankProvider();
}

/**
 * The adapter that owns an EXISTING attempt, used to check its status and to
 * handle its callbacks. Deliberately independent of CARD_PAYMENTS_ENABLED:
 * switching new card payments off must not strand a customer who already
 * paid — their confirmation still has to be collected.
 *
 * The environment rules still apply: a simulator attempt is never checked by
 * a production deployment (it could not exist there in the first place).
 */
export function getProviderForAttempt(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env
): PaymentProvider | null {
  const config = getEffectivePaymentConfig({ ...env, CARD_PAYMENTS_ENABLED: "true" });
  if (providerId === SIMULATOR_PROVIDER_ID) {
    if (config.providerId !== "simulator" || !config.enabled) return null;
    return createSimulatorProvider(config);
  }
  if (providerId === BANK_PROVIDER_ID) {
    if (config.providerId !== "bank" || !config.enabled) return null;
    return createBankProvider();
  }
  return null;
}

/** URL path segment ↔ stored provider id, for /api/payments/callback/[provider]. */
export function providerIdFromSlug(slug: string): string | null {
  if (slug === "simulator") return SIMULATOR_PROVIDER_ID;
  if (slug === "bank") return BANK_PROVIDER_ID;
  return null;
}

export function providerSlug(providerId: string): string {
  return providerId === SIMULATOR_PROVIDER_ID ? "simulator" : "bank";
}
