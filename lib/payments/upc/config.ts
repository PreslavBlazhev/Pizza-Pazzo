/**
 * UPC e-Commerce Connect (ОББ virtual POS) settings — SERVER ONLY.
 *
 * Everything comes from the environment; nothing secret has a default.
 *
 *   UPC_MERCHANT_ID          MerchantID from ОББ (test: 1731096)
 *   UPC_TERMINAL_ID          TerminalID from ОББ (test: E7059096)
 *   UPC_PRIVATE_KEY          OUR RSA private key (PEM, or the PEM base64 on one
 *                            line) — signs every payment request. SECRET.
 *   UPC_MERCHANT_CERT        optional: our public certificate (the 1731096.crt
 *                            sent to ОББ). If set, it must match the key.
 *   UPC_GATEWAY_CERT         UPC's public certificate that verifies NOTIFY and
 *                            browser returns. Sandbox default: UPC's published
 *                            test certificate (./certs.ts). Production: required.
 *   UPC_GATEWAY_URL          hosted payment page. Sandbox default:
 *                            https://ecg.test.upc.ua/kbc/pay (ОББ e-mail 29.10.2026)
 *   UPC_STATUS_URL           transaction status query. Sandbox default:
 *                            https://ecg.test.upc.ua/kbc/service/01 (answered
 *                            "TranCode=408…" to a probe on 29.10.2026; the
 *                            /kbc/go/service/01 form from the docs is a 404)
 *   UPC_REQUEST_SIGNATURE_ALG   hash for OUR signature: sha512 (default, as the
 *                            current UPC docs) | sha256 | sha1
 *   UPC_GATEWAY_SIGNATURE_ALGS  hashes accepted on UPC's signature, in order.
 *                            Sandbox default "sha512,sha1" (UPC's docs show
 *                            both); production must pin it explicitly after the
 *                            sandbox showed which one the gateway uses.
 *   UPC_SESSION_TTL_MINUTES  after this long an attempt the gateway never
 *                            registered (TranCode 408) counts as EXPIRED and a
 *                            new one may be opened. Default 20.
 *
 * Production URLs and certificates are never defaulted: they come with the
 * production MerchantID/TerminalID from ОББ.
 */
import { createHash, createPublicKey, X509Certificate } from "node:crypto";
import type { PaymentEnvironment } from "../config";
import { UPC_TEST_GATEWAY_CERT } from "./certs";
import {
  decodePem,
  isUpcSignatureAlgorithm,
  loadPrivateKey,
  loadPublicKey,
  type UpcSignatureAlgorithm,
} from "./protocol";
import type { KeyObject } from "node:crypto";

export const UPC_SANDBOX_GATEWAY_URL = "https://ecg.test.upc.ua/kbc/pay";
export const UPC_SANDBOX_STATUS_URL = "https://ecg.test.upc.ua/kbc/service/01";
const DEFAULT_TTL_MINUTES = 20;

export interface UpcSettings {
  merchantId: string;
  terminalId: string;
  gatewayUrl: string;
  statusUrl: string;
  privateKey: KeyObject;
  gatewayKey: KeyObject;
  requestAlgorithm: UpcSignatureAlgorithm;
  gatewayAlgorithms: UpcSignatureAlgorithm[];
  sessionTtlMs: number;
  /** SHA-256 of the gateway certificate in use — shown to staff, not secret. */
  gatewayCertSha256: string;
  /** True when the built-in UPC test certificate is used. */
  gatewayCertIsDefault: boolean;
}

export interface UpcSettingsResult {
  settings: UpcSettings | null;
  problems: string[];
}

function httpsUrl(raw: string, name: string, problems: string[]): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") problems.push(`${name} трябва да е HTTPS.`);
    return url.toString();
  } catch {
    problems.push(`${name} не е валиден адрес.`);
    return "";
  }
}

function sha256Fingerprint(pem: string): string {
  try {
    return new X509Certificate(pem).fingerprint256;
  } catch {
    return createHash("sha256").update(pem).digest("hex");
  }
}

/** Pure on (env, environment); reports every problem, never throws. */
export function getUpcSettings(
  environment: PaymentEnvironment | null,
  env: NodeJS.ProcessEnv = process.env
): UpcSettingsResult {
  const problems: string[] = [];
  const sandbox = environment === "sandbox";

  const merchantId = (env.UPC_MERCHANT_ID ?? "").trim();
  const terminalId = (env.UPC_TERMINAL_ID ?? "").trim();
  if (!/^[A-Za-z0-9]{1,15}$/.test(merchantId)) problems.push("UPC_MERCHANT_ID липсва или е невалиден.");
  if (!/^[A-Za-z0-9]{1,8}$/.test(terminalId)) problems.push("UPC_TERMINAL_ID липсва или е невалиден.");

  const rawGateway = (env.UPC_GATEWAY_URL ?? "").trim() || (sandbox ? UPC_SANDBOX_GATEWAY_URL : "");
  const rawStatus = (env.UPC_STATUS_URL ?? "").trim() || (sandbox ? UPC_SANDBOX_STATUS_URL : "");
  if (!rawGateway) problems.push("UPC_GATEWAY_URL не е зададен (продукционният адрес идва от ОББ).");
  if (!rawStatus) problems.push("UPC_STATUS_URL не е зададен (продукционният адрес идва от ОББ).");
  const gatewayUrl = rawGateway ? httpsUrl(rawGateway, "UPC_GATEWAY_URL", problems) : "";
  const statusUrl = rawStatus ? httpsUrl(rawStatus, "UPC_STATUS_URL", problems) : "";
  if (!sandbox && /ecg\.test\.upc\.ua/i.test(`${gatewayUrl} ${statusUrl}`)) {
    problems.push("Продукционната конфигурация сочи към тестовия gateway на UPC.");
  }
  if (sandbox && gatewayUrl && !/ecg\.test\.upc\.ua/i.test(gatewayUrl)) {
    problems.push("PAYMENT_ENV=sandbox, а UPC_GATEWAY_URL не е тестовият gateway — смесена конфигурация.");
  }

  let privateKey: KeyObject | null = null;
  const privatePem = decodePem(env.UPC_PRIVATE_KEY);
  if (!privatePem) {
    problems.push("UPC_PRIVATE_KEY липсва (частният ключ за подписване на заявките).");
  } else {
    try {
      privateKey = loadPrivateKey(privatePem);
      const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
      if (bits < 2048) problems.push(`UPC_PRIVATE_KEY е ${bits}-битов — изисква се поне 2048.`);
    } catch {
      problems.push("UPC_PRIVATE_KEY не е валиден RSA частен ключ.");
    }
  }

  const merchantCertPem = decodePem(env.UPC_MERCHANT_CERT);
  if (merchantCertPem && privateKey) {
    try {
      const fromCert = loadPublicKey(merchantCertPem).export({ type: "spki", format: "der" });
      const fromKey = createPublicKey(privateKey).export({ type: "spki", format: "der" });
      if (!fromCert.equals(fromKey)) problems.push("UPC_MERCHANT_CERT не съответства на UPC_PRIVATE_KEY.");
    } catch {
      problems.push("UPC_MERCHANT_CERT не е валиден сертификат.");
    }
  }

  const explicitGatewayCert = decodePem(env.UPC_GATEWAY_CERT);
  const gatewayPem = explicitGatewayCert || (sandbox ? UPC_TEST_GATEWAY_CERT : "");
  let gatewayKey: KeyObject | null = null;
  if (!gatewayPem) {
    problems.push("UPC_GATEWAY_CERT липсва (сертификатът на UPC за проверка на отговорите).");
  } else {
    try {
      gatewayKey = loadPublicKey(gatewayPem);
    } catch {
      problems.push("UPC_GATEWAY_CERT не е валиден сертификат/публичен ключ.");
    }
  }

  const requestRaw = (env.UPC_REQUEST_SIGNATURE_ALG ?? "sha512").trim().toLowerCase();
  const requestAlgorithm = isUpcSignatureAlgorithm(requestRaw) ? requestRaw : null;
  if (!requestAlgorithm) problems.push(`UPC_REQUEST_SIGNATURE_ALG е непознат: "${requestRaw}".`);

  const gatewayRaw = (env.UPC_GATEWAY_SIGNATURE_ALGS ?? "").trim().toLowerCase();
  if (!gatewayRaw && !sandbox) {
    problems.push("UPC_GATEWAY_SIGNATURE_ALGS трябва да е зададен изрично в продукция (пиннат след sandbox теста).");
  }
  const gatewayList = (gatewayRaw || "sha512,sha1").split(",").map((s) => s.trim()).filter(Boolean);
  const gatewayAlgorithms = gatewayList.filter(isUpcSignatureAlgorithm);
  if (gatewayAlgorithms.length === 0 || gatewayAlgorithms.length !== gatewayList.length) {
    problems.push(`UPC_GATEWAY_SIGNATURE_ALGS съдържа непознат алгоритъм: "${gatewayRaw}".`);
  }

  const ttlRaw = Number((env.UPC_SESSION_TTL_MINUTES ?? "").trim() || DEFAULT_TTL_MINUTES);
  const ttlMinutes = Number.isFinite(ttlRaw) && ttlRaw >= 5 && ttlRaw <= 180 ? ttlRaw : DEFAULT_TTL_MINUTES;

  if (problems.length > 0 || !privateKey || !gatewayKey || !requestAlgorithm) {
    return { settings: null, problems };
  }
  return {
    problems,
    settings: {
      merchantId,
      terminalId,
      gatewayUrl,
      statusUrl,
      privateKey,
      gatewayKey,
      requestAlgorithm,
      gatewayAlgorithms,
      sessionTtlMs: ttlMinutes * 60_000,
      gatewayCertSha256: sha256Fingerprint(gatewayPem),
      gatewayCertIsDefault: !explicitGatewayCert,
    },
  };
}
