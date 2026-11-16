/**
 * Google Pay and Apple Pay on ОББ's UPC terminal — settings. SERVER ONLY, pure.
 *
 * Both wallets are paid through UPC's server-to-server "payByWallet" request:
 * the browser hands us the wallet's ENCRYPTED payment data, the server signs
 * a request with the merchant key and sends it to UPC, and UPC decrypts and
 * authorises. Card numbers never reach this server.
 *
 * What ОББ confirmed (e-mail, November 2026):
 *   - wallet payments exist ONLY in production — "Не се правят тестови
 *     плащания с Apple/Google Pay". So there is no sandbox wallet at all:
 *     under PAYMENT_ENV=sandbox both wallets are off.
 *   - PROD URL https://secure.kbcbank.bg/kbc/payByWallet (UBB_PAY_BY_WALLET_URL)
 *   - gatewayMerchantId = merchant id = UPC_MERCHANT_ID (7331057). It is
 *     therefore taken from UPC_MERCHANT_ID and not configured separately.
 *   - Notify is not used for wallet payments; every answer comes through the
 *     API (the payByWallet answer and the signed status query).
 *
 * A wallet is offered only when EVERY setting below is present and coherent;
 * otherwise its button is simply not rendered (cards and cash keep working).
 * Both are OFF unless switched on explicitly.
 *
 *   UPC_WALLET_URL                    optional override of the payByWallet URL;
 *                                     must be HTTPS on the SAME host as
 *                                     UPC_GATEWAY_URL. Default: ОББ's URL when
 *                                     the gateway is secure.kbcbank.bg.
 *
 *   GOOGLE_PAY_ENABLED=true           the switch
 *   GOOGLE_PAY_MERCHANT_ID            Google's own merchant id (Google Pay &
 *                                     Wallet Console) — NOT the bank's id.
 *                                     Required for GOOGLE_PAY_ENVIRONMENT=PRODUCTION.
 *   GOOGLE_PAY_ENVIRONMENT            PRODUCTION (default) | TEST. TEST is a
 *                                     PREVIEW for Google's integration review
 *                                     (screenshots): Google returns dummy
 *                                     tokens, the server NEVER sends them to
 *                                     the bank, and the button is shown to
 *                                     staff only.
 *   GOOGLE_PAY_MERCHANT_NAME          shown in the Google Pay sheet (default "Pizza Pazzo")
 *   GOOGLE_PAY_AUTH_METHODS           default "CRYPTOGRAM_3DS". UPC lists PAN_ONLY
 *                                     too, but a PAN_ONLY payment "may" need a
 *                                     3-D Secure redirect whose format UPC does
 *                                     not document — so PAN_ONLY is refused
 *                                     until UPC documents it (see docs).
 *   GOOGLE_PAY_GATEWAY_MERCHANT_ID    obsolete; if still set it must equal
 *                                     UPC_MERCHANT_ID, otherwise Google Pay is off.
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
 *   APPLE_PAY_DOMAIN_ASSOCIATION      content of Apple's domain-association file,
 *                                     served at /.well-known/apple-developer-merchantid-domain-association
 *   WALLET_COUNTRY_CODE               merchant country for both wallets, default "BG"
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

/** ОББ's production payByWallet endpoint (ОББ e-mail, November 2026). */
export const UBB_PAY_BY_WALLET_URL = "https://secure.kbcbank.bg/kbc/payByWallet";
const UBB_PRODUCTION_HOST = "secure.kbcbank.bg";

/** UPC accepts Visa and Mastercard (Maestro included) — its Google Pay page. */
export const GOOGLE_PAY_CARD_NETWORKS = ["MASTERCARD", "VISA"] as const;
/**
 * Auth methods this site can complete. CRYPTOGRAM_3DS tokens carry the
 * device's own authentication; PAN_ONLY may need a 3-D Secure redirect that
 * UPC's documentation mentions but does not specify, so it is not offered.
 */
const GOOGLE_AUTH_METHODS = ["CRYPTOGRAM_3DS"] as const;
type GoogleAuthMethod = (typeof GOOGLE_AUTH_METHODS)[number];
/** UPC's constant gateway id for Google Pay. */
export const GOOGLE_PAY_GATEWAY = "upcua";

export const APPLE_PAY_NETWORKS = ["visa", "masterCard"] as const;

export interface GooglePaySettings {
  /** TEST = preview only: never sent to the bank, shown to staff only. */
  environment: "TEST" | "PRODUCTION";
  /** = UPC MerchantID (ОББ: gatewayMerchantId = merchant id). */
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

function walletUrlFor(gatewayUrl: string, env: NodeJS.ProcessEnv, problems: string[]): string {
  const gatewayHost = new URL(gatewayUrl).host;
  const raw = (env.UPC_WALLET_URL ?? "").trim() || (gatewayHost === UBB_PRODUCTION_HOST ? UBB_PAY_BY_WALLET_URL : "");
  if (!raw) {
    problems.push("UPC_WALLET_URL не е зададен, а UPC_GATEWAY_URL не е продукционният адрес на ОББ.");
    return "";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    problems.push("UPC_WALLET_URL не е валиден адрес.");
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search) {
    problems.push("UPC_WALLET_URL трябва да е чист HTTPS адрес.");
    return "";
  }
  if (/(^|\.)test\.upc\.ua$/i.test(url.hostname)) {
    problems.push("UPC_WALLET_URL сочи към тестовия gateway — ОББ: wallet плащания има само в продукция.");
    return "";
  }
  if (url.host !== gatewayHost) {
    problems.push("UPC_WALLET_URL и UPC_GATEWAY_URL са на различни сървъри — смесена конфигурация.");
    return "";
  }
  return url.toString();
}

function googleSettings(merchantIdAtUpc: string, env: NodeJS.ProcessEnv, problems: string[]): GooglePaySettings | null {
  if (!on(env.GOOGLE_PAY_ENABLED)) return null;
  const before = problems.length;
  const legacy = (env.GOOGLE_PAY_GATEWAY_MERCHANT_ID ?? "").trim();
  if (legacy && legacy !== merchantIdAtUpc) {
    problems.push(
      `Google Pay: GOOGLE_PAY_GATEWAY_MERCHANT_ID (${legacy}) ≠ UPC_MERCHANT_ID — по ОББ gatewayMerchantId е MerchantID; премахнете променливата.`
    );
  }
  const rawEnv = ((env.GOOGLE_PAY_ENVIRONMENT ?? "").trim() || "PRODUCTION").toUpperCase();
  if (rawEnv !== "PRODUCTION" && rawEnv !== "TEST") {
    problems.push(`Google Pay: GOOGLE_PAY_ENVIRONMENT е непознат: "${rawEnv}" (PRODUCTION | TEST).`);
  }
  const environment: "TEST" | "PRODUCTION" = rawEnv === "TEST" ? "TEST" : "PRODUCTION";
  const merchantId = (env.GOOGLE_PAY_MERCHANT_ID ?? "").trim();
  if (merchantId && !/^[A-Za-z0-9_-]{1,64}$/.test(merchantId)) {
    problems.push("Google Pay: GOOGLE_PAY_MERCHANT_ID е невалиден.");
  }
  if (environment === "PRODUCTION" && !merchantId) {
    problems.push("Google Pay: GOOGLE_PAY_MERCHANT_ID (от Google Pay & Wallet Console) е задължителен за PRODUCTION.");
  }
  const rawMethods = (env.GOOGLE_PAY_AUTH_METHODS ?? "").trim() || GOOGLE_AUTH_METHODS.join(",");
  const list = rawMethods.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const authMethods = list.filter((m): m is GoogleAuthMethod => (GOOGLE_AUTH_METHODS as readonly string[]).includes(m));
  if (list.includes("PAN_ONLY")) {
    problems.push(
      "Google Pay: PAN_ONLY изисква 3-D Secure пренасочване, чийто формат UPC не е документирал — разрешен е само CRYPTOGRAM_3DS."
    );
  } else if (authMethods.length === 0 || authMethods.length !== list.length) {
    problems.push(`Google Pay: GOOGLE_PAY_AUTH_METHODS съдържа непознат метод: "${rawMethods}" (CRYPTOGRAM_3DS).`);
  }
  const merchantName = ((env.GOOGLE_PAY_MERCHANT_NAME ?? "").trim() || "Pizza Pazzo").slice(0, 64);
  if (problems.length > before) return null;
  return {
    environment,
    gatewayMerchantId: merchantIdAtUpc,
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
 * real UPC adapter in PRODUCTION carries wallets — never the simulator, the
 * demo or the bank's test terminal — and only while card payment is on.
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
  if (config.environment !== "production") {
    problems.push("ОББ: Google Pay / Apple Pay се поддържат само в продукционна среда — при PAYMENT_ENV=sandbox са изключени.");
    return off;
  }
  if (!countryCode) {
    problems.push("WALLET_COUNTRY_CODE трябва да е двубуквен ISO код (напр. BG).");
    return off;
  }
  const { settings: upc } = getUpcSettings(config.environment, env);
  if (!upc) {
    problems.push("UPC настройките не са пълни — портфейлите са изключени.");
    return off;
  }
  const walletUrl = walletUrlFor(upc.gatewayUrl, env, problems);
  const google = googleSettings(upc.merchantId, env, problems);
  const apple = appleSettings(config, env, problems);
  if (!walletUrl) return off;
  return { walletUrl, countryCode, google, apple, problems };
}

export function walletEnabled(settings: WalletSettings, wallet: WalletType): boolean {
  return wallet === "GOOGLE_PAY" ? !!settings.google : !!settings.apple;
}

/** Google Pay in its TEST environment: a preview whose tokens never reach the bank. */
export function isGooglePayPreview(settings: WalletSettings): boolean {
  return settings.google?.environment === "TEST";
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

/**
 * The client-side configuration, or null when nothing may be shown. A Google
 * Pay TEST preview is drawn for staff only (`viewerIsStaff`).
 */
export function walletClientConfig(
  settings: WalletSettings,
  input: { amountMinor: number; currency: string; viewerIsStaff?: boolean }
): WalletClientConfig | null {
  const google = settings.google && (settings.google.environment === "PRODUCTION" || input.viewerIsStaff) ? settings.google : null;
  if (!google && !settings.apple) return null;
  const amount = (input.amountMinor / 100).toFixed(2);
  const countryCode = settings.countryCode;
  return {
    amount,
    currency: input.currency,
    countryCode,
    google: google && {
      environment: google.environment,
      gateway: GOOGLE_PAY_GATEWAY,
      gatewayMerchantId: google.gatewayMerchantId,
      merchantId: google.merchantId,
      merchantName: google.merchantName,
      authMethods: google.authMethods,
      networks: [...GOOGLE_PAY_CARD_NETWORKS],
    },
    apple: settings.apple && {
      displayName: settings.apple.displayName,
      countryCode: settings.apple.countryCode,
      networks: [...APPLE_PAY_NETWORKS],
    },
  };
}
