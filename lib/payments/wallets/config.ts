/**
 * Google Pay and Apple Pay on ОББ's UPC terminal — settings. SERVER ONLY, pure.
 *
 * Both wallets are paid through UPC's server-to-server "payByWallet" request:
 * the browser hands us the wallet's ENCRYPTED payment data, the server signs
 * a request with the merchant key and sends it to UPC, and UPC decrypts and
 * authorises. Card numbers never reach this server.
 *
 * A wallet is offered only when EVERY setting below is present and coherent;
 * otherwise its button is simply not rendered (cards and cash keep working).
 * Nothing here has a default for an identifier, a certificate or a bank URL.
 *
 *   UPC_WALLET_URL                    UPC payByWallet endpoint — from ОББ/UPC.
 *                                     Must be on the SAME host as
 *                                     UPC_GATEWAY_URL (one environment).
 *                                     Probe 11.11.2026 (GET, no payment):
 *                                     ecg.test.upc.ua/kbc/payByWallet and
 *                                     secure.kbcbank.bg/kbc/payByWallet answer
 *                                     405 (POST only); /go/payByWallet from
 *                                     UPC's generic docs is 404 on ОББ's host.
 *                                     Still to be CONFIRMED by ОББ/UPC.
 *
 *   GOOGLE_PAY_ENABLED=true           the switch
 *   GOOGLE_PAY_GATEWAY_MERCHANT_ID    tokenizationSpecification.gatewayMerchantId
 *                                     = UPC "Point of Service Id (pos_id)" — from UPC
 *   GOOGLE_PAY_MERCHANT_ID            Google's own merchant id (Google Pay &
 *                                     Wallet Console) — required in PRODUCTION
 *   GOOGLE_PAY_MERCHANT_NAME          shown in the Google Pay sheet (default "Pizza Pazzo")
 *   GOOGLE_PAY_AUTH_METHODS           default "PAN_ONLY,CRYPTOGRAM_3DS" (UPC docs)
 *     The Google environment follows PAYMENT_ENV: sandbox → TEST, production →
 *     PRODUCTION. It cannot be set separately, so test tokens never reach the
 *     production terminal and real ones never the test terminal.
 *
 *   APPLE_PAY_ENABLED=true            the switch
 *   APPLE_PAY_MERCHANT_ID             our Apple Merchant ID, e.g. "merchant.bg.pizzapazzo"
 *   APPLE_PAY_MERCHANT_IDENTITY_CERT  Merchant Identity certificate (PEM or base64
 *                                     PEM) — authenticates US to Apple for the
 *                                     merchant validation. NOT the Payment
 *                                     Processing certificate (that one is made
 *                                     from UPC's CSR and lives at UPC).
 *   APPLE_PAY_MERCHANT_IDENTITY_KEY   its private key (PEM or base64 PEM). SECRET.
 *   APPLE_PAY_DOMAIN                  the verified domain (initiativeContext);
 *                                     default: the host of APP_BASE_URL
 *   APPLE_PAY_DISPLAY_NAME            default "Pizza Pazzo"
 *   WALLET_COUNTRY_CODE               merchant country for both wallets, default "BG"
 *   APPLE_PAY_DOMAIN_ASSOCIATION      content of Apple's domain-association file,
 *                                     served at /.well-known/apple-developer-merchantid-domain-association
 */
import { X509Certificate, createPrivateKey, type KeyObject } from "node:crypto";
import type { PaymentConfig } from "../config";
import { getUpcSettings } from "../upc/config";
import { decodePem } from "../upc/protocol";

export const WALLET_TYPES = ["GOOGLE_PAY", "APPLE_PAY"] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export function isWalletType(v: unknown): v is WalletType {
  return v === "GOOGLE_PAY" || v === "APPLE_PAY";
}

/** UPC accepts Visa and Mastercard (Maestro included) — its Google Pay page. */
export const GOOGLE_PAY_CARD_NETWORKS = ["MASTERCARD", "VISA"] as const;
const GOOGLE_AUTH_METHODS = ["PAN_ONLY", "CRYPTOGRAM_3DS"] as const;
type GoogleAuthMethod = (typeof GOOGLE_AUTH_METHODS)[number];
/** UPC's constant gateway id for Google Pay. */
export const GOOGLE_PAY_GATEWAY = "upcua";

export const APPLE_PAY_NETWORKS = ["visa", "masterCard"] as const;

export interface GooglePaySettings {
  environment: "TEST" | "PRODUCTION";
  gatewayMerchantId: string;
  /** Google merchant id; may be empty in TEST only. */
  merchantId: string;
  merchantName: string;
  authMethods: GoogleAuthMethod[];
}

export interface ApplePaySettings {
  merchantIdentifier: string;
  displayName: string;
  domain: string;
  countryCode: string;
  /** PEM strings for the mutual-TLS merchant validation call. SECRET (key). */
  identityCertPem: string;
  identityKeyPem: string;
}

export interface WalletSettings {
  walletUrl: string;
  /** Merchant country (ISO 3166 alpha-2) for both wallet sheets. */
  countryCode: string;
  google: GooglePaySettings | null;
  apple: ApplePaySettings | null;
  /** Why a wallet is off — for staff (admin), never for customers. */
  problems: string[];
}

const on = (v: string | undefined) => (v ?? "").trim().toLowerCase() === "true";

function walletUrlFor(config: PaymentConfig, env: NodeJS.ProcessEnv, problems: string[]): string {
  const raw = (env.UPC_WALLET_URL ?? "").trim();
  if (!raw) {
    problems.push("UPC_WALLET_URL не е зададен (адресът за payByWallet идва от ОББ/UPC).");
    return "";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    problems.push("UPC_WALLET_URL не е валиден адрес.");
    return "";
  }
  if (url.protocol !== "https:") {
    problems.push("UPC_WALLET_URL трябва да е HTTPS.");
    return "";
  }
  const sandbox = config.environment === "sandbox";
  const testHost = /(^|\.)ecg\.test\.upc\.ua$/i.test(url.hostname);
  if (sandbox !== testHost) {
    problems.push(
      sandbox
        ? "PAYMENT_ENV=sandbox, а UPC_WALLET_URL не е тестовият gateway на UPC — смесена конфигурация."
        : "Продукционната конфигурация сочи UPC_WALLET_URL към тестовия gateway на UPC."
    );
    return "";
  }
  const { settings } = getUpcSettings(config.environment, env);
  if (settings && new URL(settings.gatewayUrl).host !== url.host) {
    problems.push("UPC_WALLET_URL и UPC_GATEWAY_URL са на различни сървъри — смесена тестова/продукционна конфигурация.");
    return "";
  }
  return url.toString();
}

function googleSettings(config: PaymentConfig, env: NodeJS.ProcessEnv, problems: string[]): GooglePaySettings | null {
  if (!on(env.GOOGLE_PAY_ENABLED)) return null;
  const before = problems.length;
  const production = config.environment === "production";
  const gatewayMerchantId = (env.GOOGLE_PAY_GATEWAY_MERCHANT_ID ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(gatewayMerchantId)) {
    problems.push("Google Pay: GOOGLE_PAY_GATEWAY_MERCHANT_ID (UPC pos_id) липсва или е невалиден.");
  }
  const merchantId = (env.GOOGLE_PAY_MERCHANT_ID ?? "").trim();
  if (merchantId && !/^[A-Za-z0-9_-]{1,64}$/.test(merchantId)) {
    problems.push("Google Pay: GOOGLE_PAY_MERCHANT_ID е невалиден.");
  }
  if (production && !merchantId) {
    problems.push("Google Pay: GOOGLE_PAY_MERCHANT_ID (от Google Pay & Wallet Console) е задължителен в продукция.");
  }
  const rawMethods = (env.GOOGLE_PAY_AUTH_METHODS ?? "").trim() || GOOGLE_AUTH_METHODS.join(",");
  const list = rawMethods.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const authMethods = list.filter((m): m is GoogleAuthMethod => (GOOGLE_AUTH_METHODS as readonly string[]).includes(m));
  if (authMethods.length === 0 || authMethods.length !== list.length) {
    problems.push(`Google Pay: GOOGLE_PAY_AUTH_METHODS съдържа непознат метод: "${rawMethods}" (PAN_ONLY, CRYPTOGRAM_3DS).`);
  }
  const merchantName = ((env.GOOGLE_PAY_MERCHANT_NAME ?? "").trim() || "Pizza Pazzo").slice(0, 64);
  if (problems.length > before) return null;
  return {
    environment: production ? "PRODUCTION" : "TEST",
    gatewayMerchantId,
    merchantId,
    merchantName,
    authMethods: [...new Set(authMethods)],
  };
}

function appleSettings(config: PaymentConfig, env: NodeJS.ProcessEnv, problems: string[]): ApplePaySettings | null {
  if (!on(env.APPLE_PAY_ENABLED)) return null;
  const before = problems.length;
  const merchantIdentifier = (env.APPLE_PAY_MERCHANT_ID ?? "").trim();
  if (!/^merchant\.[A-Za-z0-9][A-Za-z0-9.-]{1,120}$/.test(merchantIdentifier)) {
    problems.push("Apple Pay: APPLE_PAY_MERCHANT_ID липсва или не е във вида merchant.<домейн>.");
  }
  const identityCertPem = decodePem(env.APPLE_PAY_MERCHANT_IDENTITY_CERT);
  const identityKeyPem = decodePem(env.APPLE_PAY_MERCHANT_IDENTITY_KEY);
  if (!identityCertPem) problems.push("Apple Pay: APPLE_PAY_MERCHANT_IDENTITY_CERT липсва (Merchant Identity сертификатът).");
  if (!identityKeyPem) problems.push("Apple Pay: APPLE_PAY_MERCHANT_IDENTITY_KEY липсва (ключът на Merchant Identity сертификата).");
  if (identityCertPem && identityKeyPem) {
    try {
      const cert = new X509Certificate(identityCertPem);
      let key: KeyObject;
      try {
        key = createPrivateKey({ key: identityKeyPem, format: "pem" });
      } catch {
        throw new Error("key");
      }
      if (!cert.checkPrivateKey(key)) problems.push("Apple Pay: ключът не съответства на Merchant Identity сертификата.");
      if (new Date(cert.validTo).getTime() < Date.now()) problems.push("Apple Pay: Merchant Identity сертификатът е изтекъл.");
    } catch (err) {
      problems.push(
        (err as Error).message === "key"
          ? "Apple Pay: APPLE_PAY_MERCHANT_IDENTITY_KEY не е валиден частен ключ."
          : "Apple Pay: APPLE_PAY_MERCHANT_IDENTITY_CERT не е валиден сертификат."
      );
    }
  }
  let domain = (env.APPLE_PAY_DOMAIN ?? "").trim().toLowerCase();
  if (!domain) {
    try {
      domain = new URL(config.baseUrl).hostname;
    } catch {
      domain = "";
    }
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    problems.push("Apple Pay: APPLE_PAY_DOMAIN (потвърденият домейн) липсва или е невалиден.");
  }
  const countryCode = walletCountryCode(env);
  const displayName = ((env.APPLE_PAY_DISPLAY_NAME ?? "").trim() || "Pizza Pazzo").slice(0, 64);
  if (problems.length > before) return null;
  return { merchantIdentifier, displayName, domain, countryCode, identityCertPem, identityKeyPem };
}

function walletCountryCode(env: NodeJS.ProcessEnv): string {
  const code = ((env.WALLET_COUNTRY_CODE ?? "").trim() || "BG").toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

/**
 * The wallets that may be offered under this payment configuration. Only the
 * real UPC adapter carries wallets — never the simulator or the demo — and
 * only while card payment itself is configured and on.
 */
export function getWalletSettings(config: PaymentConfig, env: NodeJS.ProcessEnv = process.env): WalletSettings {
  const problems: string[] = [];
  const countryCode = walletCountryCode(env);
  const off = { walletUrl: "", countryCode, google: null, apple: null, problems };
  const wanted = on(env.GOOGLE_PAY_ENABLED) || on(env.APPLE_PAY_ENABLED);
  if (!wanted) return off;
  if (config.providerId !== "upc" || !config.enabled) {
    problems.push("Google Pay / Apple Pay работят само през реалния UPC терминал на ОББ, когато плащането с карта е включено.");
    return off;
  }
  if (!countryCode) {
    problems.push("WALLET_COUNTRY_CODE трябва да е двубуквен ISO код (напр. BG).");
    return off;
  }
  const walletUrl = walletUrlFor(config, env, problems);
  const google = googleSettings(config, env, problems);
  const apple = appleSettings(config, env, problems);
  if (!walletUrl) return off;
  return { walletUrl, countryCode, google, apple, problems };
}

export function walletEnabled(settings: WalletSettings, wallet: WalletType): boolean {
  return wallet === "GOOGLE_PAY" ? !!settings.google : !!settings.apple;
}

/** What the browser needs to draw the buttons — identifiers only, no secrets. */
export interface WalletClientConfig {
  /** Amount as the server stored it, e.g. "20.90". */
  amount: string;
  currency: string;
  countryCode: string;
  google: {
    environment: "TEST" | "PRODUCTION";
    gateway: typeof GOOGLE_PAY_GATEWAY;
    gatewayMerchantId: string;
    merchantId: string;
    merchantName: string;
    authMethods: string[];
    networks: string[];
  } | null;
  apple: {
    displayName: string;
    countryCode: string;
    networks: string[];
  } | null;
}

export function walletClientConfig(
  settings: WalletSettings,
  input: { amountMinor: number; currency: string }
): WalletClientConfig | null {
  if (!settings.google && !settings.apple) return null;
  const amount = (input.amountMinor / 100).toFixed(2);
  const countryCode = settings.countryCode;
  return {
    amount,
    currency: input.currency,
    countryCode,
    google: settings.google && {
      environment: settings.google.environment,
      gateway: GOOGLE_PAY_GATEWAY,
      gatewayMerchantId: settings.google.gatewayMerchantId,
      merchantId: settings.google.merchantId,
      merchantName: settings.google.merchantName,
      authMethods: settings.google.authMethods,
      networks: [...GOOGLE_PAY_CARD_NETWORKS],
    },
    apple: settings.apple && {
      displayName: settings.apple.displayName,
      countryCode: settings.apple.countryCode,
      networks: [...APPLE_PAY_NETWORKS],
    },
  };
}
