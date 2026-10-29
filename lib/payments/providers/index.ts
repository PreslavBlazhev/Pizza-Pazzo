/**
 * Provider registry — SERVER ONLY. The one place that turns configuration
 * into a concrete adapter.
 *
 * Two sources, in this order:
 *   1. the ENVIRONMENT (lib/payments/config.ts): ОББ's UPC terminal, or the
 *      simulator on development/staging — refused in production;
 *   2. the card DEMO switch in the database (lib/payments/demo.ts): the
 *      simulator on the live site, for the audience the owner chose.
 * A configured real provider always wins; the demo never replaces a bank.
 */
import { getPaymentConfig, type PaymentConfig } from "../config";
import type { PaymentProvider } from "../types";
import { demoAllowsViewer, demoSimulatorConfig, getCardDemoMode, isStaffRole } from "../demo";
import { createSimulatorProvider, SIMULATOR_PROVIDER_ID } from "./simulator";
import { createUpcProvider, upcConfigProblems, UPC_PROVIDER_ID } from "./upc";

/** Environment config plus the chosen adapter's own requirements. */
export function getEffectivePaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const config = getPaymentConfig(env);
  if (config.providerId === "upc") {
    const extra = upcConfigProblems(config, env);
    if (extra.length > 0) {
      return { ...config, enabled: false, problems: [...config.problems, ...extra] };
    }
  }
  return config;
}

function providerFor(config: PaymentConfig, env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  return config.providerId === "simulator" ? createSimulatorProvider(config) : createUpcProvider(config, env);
}

export interface CheckoutPaymentSetup {
  /** May THIS viewer choose "pay by card" right now? */
  available: boolean;
  /** True when that option is the demo (simulator on the live site). */
  demo: boolean;
  /** True when that option is a bank TEST environment (no real money). */
  sandbox: boolean;
  config: PaymentConfig;
}

/**
 * What checkout may offer to a viewer with this role (null = guest). Used by
 * the checkout page (to show the option) and by placeOrder (to accept it) —
 * the same answer in both places.
 */
export async function resolveCheckoutPayment(role: string | null | undefined): Promise<CheckoutPaymentSetup> {
  const env = getEffectivePaymentConfig();
  if (env.enabled) {
    // A bank sandbox on the live site is for staff only.
    if (env.audience === "staff" && !isStaffRole(role)) {
      return { available: false, demo: false, sandbox: false, config: env };
    }
    return { available: true, demo: false, sandbox: env.environment === "sandbox", config: env };
  }

  const mode = await getCardDemoMode();
  if (demoAllowsViewer(mode, role)) {
    const demo = demoSimulatorConfig();
    if (demo.enabled) return { available: true, demo: true, sandbox: false, config: demo };
  }
  return { available: false, demo: false, sandbox: false, config: env };
}

/**
 * The adapter for a NEW payment on an existing card order. The order's own
 * test flag decides between the real provider and the demo: a demo order
 * (isTest) can only ever be paid through the simulator or a sandbox, a real
 * one only through the configured production provider.
 */
export async function getProviderForNewPayment(
  order: { isTest: boolean }
): Promise<{ provider: PaymentProvider; config: PaymentConfig } | null> {
  const env = getEffectivePaymentConfig();
  if (env.enabled && env.isTest === order.isTest) {
    return { provider: providerFor(env), config: env };
  }
  if (order.isTest && (await getCardDemoMode()) !== "OFF") {
    const demo = demoSimulatorConfig();
    if (demo.enabled) return { provider: createSimulatorProvider(demo), config: demo };
  }
  return null;
}

/**
 * The adapter that owns an EXISTING attempt, used to check its status and to
 * handle its callbacks. Independent of CARD_PAYMENTS_ENABLED: switching new
 * card payments off must not strand a customer who already paid.
 *
 * A simulator attempt is verified by the environment's simulator
 * (development/staging) or, on the live site, by the demo — while the demo
 * switch is not OFF. A UPC attempt needs the UPC settings of the SAME
 * environment it was created in (a sandbox attempt is never checked against
 * the production terminal, nor the other way round).
 */
export async function getProviderForAttempt(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
  attemptEnvironment?: string
): Promise<PaymentProvider | null> {
  const config = getEffectivePaymentConfig({ ...env, CARD_PAYMENTS_ENABLED: "true" });
  if (providerId === SIMULATOR_PROVIDER_ID) {
    if (config.providerId === "simulator" && config.enabled) return createSimulatorProvider(config);
    if ((await getCardDemoMode()) !== "OFF") {
      const demo = demoSimulatorConfig(env);
      if (demo.enabled) return createSimulatorProvider(demo);
    }
    return null;
  }
  if (providerId === UPC_PROVIDER_ID) {
    if (config.providerId !== "upc" || !config.enabled) return null;
    if (attemptEnvironment && attemptEnvironment !== config.environment) return null;
    return createUpcProvider(config, env);
  }
  return null;
}

/**
 * The simulator's own configuration when its hosted page / decision action
 * may run here: the environment simulator, or the demo. Null otherwise.
 */
export async function getSimulatorConfig(): Promise<PaymentConfig | null> {
  const env = getEffectivePaymentConfig({ ...process.env, CARD_PAYMENTS_ENABLED: "true" });
  if (env.providerId === "simulator" && env.enabled) return env;
  if ((await getCardDemoMode()) !== "OFF") {
    const demo = demoSimulatorConfig();
    if (demo.enabled) return demo;
  }
  return null;
}

/** URL path segment ↔ stored provider id, for /api/payments/callback/[provider]. */
export function providerIdFromSlug(slug: string): string | null {
  if (slug === "simulator") return SIMULATOR_PROVIDER_ID;
  if (slug === "upc") return UPC_PROVIDER_ID;
  return null;
}

export function providerSlug(providerId: string): string {
  return providerId === SIMULATOR_PROVIDER_ID ? "simulator" : "upc";
}
