/**
 * Online card payment configuration — SERVER ONLY, dependency-free.
 *
 * Card payments are OFF unless every one of these holds; otherwise checkout
 * simply does not offer the card option (cash keeps working):
 *
 *   CARD_PAYMENTS_ENABLED=true         the owner's kill switch
 *   PAYMENT_PROVIDER=<id>              "simulator", or the real bank adapter
 *   APP_BASE_URL=https://…             where the provider sends people back
 *   + the provider's own settings      (see the provider's validateConfig)
 *
 * And the environment rules that make an accident impossible:
 *
 *   simulator           only when APP_ENV is development or staging, plus
 *                       PAYMENT_SIMULATOR_SECRET — never in production
 *   PAYMENT_ENV=sandbox only when APP_ENV is development or staging — a bank
 *                       sandbox "pays" with test cards, and production must
 *                       never cook food for money that does not exist
 *   PAYMENT_ENV=production  only when APP_ENV=production, over HTTPS, with an
 *                       explicitly configured currency
 *
 * Turning card payments off again is `CARD_PAYMENTS_ENABLED=false` and a
 * restart; orders already paid stay paid and keep going through the kitchen.
 */
import { getAppBaseUrl, getAppEnv, type AppEnv } from "@/lib/app-env";

export type PaymentEnvironment = "simulator" | "sandbox" | "production";

/** Provider ids the registry knows. "bank" is the place for the real adapter. */
export const PAYMENT_PROVIDER_IDS = ["simulator", "bank"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

export interface PaymentConfig {
  /** True only when card payments may be offered and started right now. */
  enabled: boolean;
  /** Why they are off — shown to staff in the admin, never to customers. */
  problems: string[];
  appEnv: AppEnv;
  providerId: PaymentProviderId | null;
  environment: PaymentEnvironment | null;
  /** ISO 4217 alphabetic, e.g. "EUR". */
  currency: string;
  baseUrl: string;
  /** Orders paid under this config are test orders (simulator / sandbox). */
  isTest: boolean;
  simulatorSecret: string;
}

/** Minimum length for the simulator's callback-signing secret. */
const MIN_SECRET_LENGTH = 16;

export function getPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const problems: string[] = [];
  const appEnv = getAppEnv(env);
  const baseUrl = getAppBaseUrl(env);
  const switchOn = (env.CARD_PAYMENTS_ENABLED ?? "").trim().toLowerCase() === "true";

  const rawProvider = (env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  const providerId = (PAYMENT_PROVIDER_IDS as readonly string[]).includes(rawProvider)
    ? (rawProvider as PaymentProviderId)
    : null;

  if (!switchOn) problems.push("CARD_PAYMENTS_ENABLED не е true — картовото плащане е изключено.");
  if (!rawProvider) problems.push("PAYMENT_PROVIDER не е зададен.");
  else if (!providerId) problems.push(`Непознат PAYMENT_PROVIDER: "${rawProvider}".`);

  let environment: PaymentEnvironment | null = null;
  if (providerId === "simulator") {
    environment = "simulator";
  } else if (providerId) {
    const rawEnv = (env.PAYMENT_ENV ?? "").trim().toLowerCase();
    if (rawEnv === "sandbox" || rawEnv === "production") environment = rawEnv;
    else problems.push('PAYMENT_ENV трябва да е "sandbox" или "production".');
  }

  // ── The environment rules. These are the reason a demo can never take a
  //    real order, and a real deployment can never take a fake payment.
  if (environment === "simulator" || environment === "sandbox") {
    if (appEnv === "production") {
      problems.push(
        `${environment === "simulator" ? "Симулаторът" : "Банков sandbox"} е забранен при APP_ENV=production.`
      );
    }
  }
  if (environment === "production" && appEnv !== "production") {
    problems.push("PAYMENT_ENV=production е позволен само при APP_ENV=production.");
  }

  const simulatorSecret = (env.PAYMENT_SIMULATOR_SECRET ?? "").trim();
  if (environment === "simulator" && simulatorSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`PAYMENT_SIMULATOR_SECRET липсва или е по-къс от ${MIN_SECRET_LENGTH} знака.`);
  }

  if (!baseUrl) {
    problems.push("APP_BASE_URL не е зададен — няма адрес, на който банката да върне клиента.");
  } else if (appEnv !== "development" && !baseUrl.startsWith("https://")) {
    problems.push(`APP_BASE_URL трябва да е HTTPS извън development (сега: ${baseUrl}).`);
  }

  // A real provider's currency is whatever the contract says — never assumed.
  const rawCurrency = (env.PAYMENT_CURRENCY ?? "").trim().toUpperCase();
  let currency = rawCurrency;
  if (environment === "simulator" && !currency) currency = "EUR";
  if (!currency) {
    problems.push("PAYMENT_CURRENCY не е зададена — потвърдете валутата по договора с банката.");
  } else if (!/^[A-Z]{3}$/.test(currency)) {
    problems.push(`PAYMENT_CURRENCY трябва да е ISO 4217 код (напр. EUR), сега: "${currency}".`);
  } else if (currency !== "EUR") {
    // The whole site prices in euros; charging another currency would need a
    // conversion nobody has agreed on.
    problems.push(`Сайтът таксува само в EUR, а PAYMENT_CURRENCY е ${currency}.`);
  }

  return {
    enabled: problems.length === 0,
    problems,
    appEnv,
    providerId,
    environment,
    currency: currency || "EUR",
    baseUrl,
    isTest: environment !== "production",
    simulatorSecret,
  };
}

/** Customer-facing yes/no: may checkout offer "pay by card"? */
export function isCardPaymentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return getPaymentConfig(env).enabled;
}
