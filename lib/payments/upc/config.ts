/**
 * UPC e-Commerce Connect (ОББ virtual POS) settings — SERVER ONLY.
 *
 * Everything comes from the environment; nothing secret has a default.
 *
 *   UPC_MERCHANT_ID          MerchantID from ОББ (test: 1731096)
 *   UPC_TERMINAL_ID          TerminalID from ОББ (test: E7059096)
 *   UPC_PRIVATE_KEY          OUR RSA private key (PEM, or the PEM base64 on one
 *                            line) — signs every payment request. SECRET.
 *   UPC_MERCHANT_CERT        our public certificate (the <MerchantID>.crt sent
 *                            to ОББ): optional in the sandbox, REQUIRED in
 *                            production. It must match the key, and its CN must
 *                            be UPC_MERCHANT_ID — so a test key can never sign
 *                            for the production terminal (or the other way).
 *   UPC_GATEWAY_CERT         UPC's public certificate that verifies NOTIFY and
 *                            browser returns. Sandbox default: UPC's published
 *                            test certificate (./certs.ts). Production: required,
 *                            and never the test certificate (UPC's published
 *                            production one is in ./certs.ts for comparison).
 *   UPC_GATEWAY_URL          hosted payment page. Sandbox default:
 *                            https://ecg.test.upc.ua/kbc/pay (ОББ e-mail 29.10.2026)
 *   UPC_STATUS_URL           transaction status query. Sandbox default:
 *                            https://ecg.test.upc.ua/kbc/service/01 (answered
 *                            "TranCode=408…" to a probe on 29.10.2026; the
 *                            /kbc/go/service/01 form from the docs is a 404)
 *   UPC_REQUEST_SIGNATURE_ALG   hash for OUR signature: sha512 (default, as the
 *                            current UPC docs) | sha256 | sha1
 *   UPC_GATEWAY_SIGNATURE_ALGS  hashes accepted on UPC's signature, in order.
 *                            Sandbox default "sha512": the KBC test gateway signs
 *                            RS512 with UPC's published test key (verified on a
 *                            real answer, 29.10.2026); UPC's older PHP samples
 *                            use SHA-1 — add "sha1" only if a real NOTIFY needs
 *                            it. Production must pin it explicitly.
 *   UPC_STATUS_PROTOCOL      json (default): the status answer is signed by UPC
 *                            (RS512) and verified with the gateway key; text:
 *                            the unsigned Key=Value variant, fallback only.
 *
 * Production URLs and certificates are never defaulted: they come with the
 * production MerchantID/TerminalID from ОББ. For ОББ (KBC) they are
 * https://secure.kbcbank.bg/kbc/pay and …/kbc/service/01 (UPC "Endpoints" →
 * BULGARIA; the gateway address also in ОББ's e-mail of 30.10.2026). The
 * gateway and the status query must be on the same host — one environment.
 */
import { createHash, createPublicKey, X509Certificate } from "node:crypto";
import type { PaymentEnvironment } from "../config";
import { UPC_PRODUCTION_GATEWAY_CERT, UPC_TEST_GATEWAY_CERT } from "./certs";
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

export interface UpcSettings {
  merchantId: string;
  terminalId: string;
  gatewayUrl: string;
  statusUrl: string;
  privateKey: KeyObject;
  gatewayKey: KeyObject;
  requestAlgorithm: UpcSignatureAlgorithm;
  gatewayAlgorithms: UpcSignatureAlgorithm[];
  /** json = answers signed by UPC and verified (default); text = unsigned fallback. */
  statusProtocol: "json" | "text";
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

/** Same RSA public key (the certificates are only containers — keys are pinned). */
function sameKey(a: KeyObject, pem: string): boolean {
  try {
    const der = (k: KeyObject) => k.export({ type: "spki", format: "der" });
    return der(a).equals(der(loadPublicKey(pem)));
  } catch {
    return false;
  }
}

/** The CN of an X.509 certificate ("" if it has none), or null for a bare public key. */
function certificateCommonName(pem: string): string | null {
  try {
    const subject = new X509Certificate(pem).subject;
    return /^CN=(.*)$/m.exec(subject)?.[1]?.trim() ?? "";
  } catch {
    return null;
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
  if (gatewayUrl && statusUrl && new URL(gatewayUrl).host !== new URL(statusUrl).host) {
    problems.push("UPC_GATEWAY_URL и UPC_STATUS_URL са на различни сървъри — смесена тестова/продукционна конфигурация.");
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
  if (!merchantCertPem && !sandbox) {
    problems.push("UPC_MERCHANT_CERT е задължителен в продукция (сертификатът, изпратен на ОББ — доказва, че ключът е за този MerchantID).");
  }
  if (merchantCertPem) {
    const cn = certificateCommonName(merchantCertPem);
    if (cn === null) {
      if (!sandbox) problems.push("UPC_MERCHANT_CERT трябва да е X.509 сертификат (.crt), не само публичен ключ.");
    } else if (cn !== merchantId) {
      problems.push(
        `UPC_MERCHANT_CERT е издаден за „${cn}“, а UPC_MERCHANT_ID е ${merchantId} — смесени тестови/продукционни ключове.`
      );
    }
  }
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
    if (gatewayKey && !sandbox && sameKey(gatewayKey, UPC_TEST_GATEWAY_CERT)) {
      problems.push("UPC_GATEWAY_CERT е тестовият сертификат на UPC — в продукция е нужен продукционният.");
      gatewayKey = null;
    }
    if (gatewayKey && sandbox && sameKey(gatewayKey, UPC_PRODUCTION_GATEWAY_CERT)) {
      problems.push("PAYMENT_ENV=sandbox, а UPC_GATEWAY_CERT е продукционният сертификат на UPC — смесена конфигурация.");
      gatewayKey = null;
    }
  }

  const requestRaw = (env.UPC_REQUEST_SIGNATURE_ALG ?? "sha512").trim().toLowerCase();
  const requestAlgorithm = isUpcSignatureAlgorithm(requestRaw) ? requestRaw : null;
  if (!requestAlgorithm) problems.push(`UPC_REQUEST_SIGNATURE_ALG е непознат: "${requestRaw}".`);

  const gatewayRaw = (env.UPC_GATEWAY_SIGNATURE_ALGS ?? "").trim().toLowerCase();
  if (!gatewayRaw && !sandbox) {
    problems.push("UPC_GATEWAY_SIGNATURE_ALGS трябва да е зададен изрично в продукция (пиннат след sandbox теста).");
  }
  const gatewayList = (gatewayRaw || "sha512").split(",").map((s) => s.trim()).filter(Boolean);
  const gatewayAlgorithms = gatewayList.filter(isUpcSignatureAlgorithm);
  if (gatewayAlgorithms.length === 0 || gatewayAlgorithms.length !== gatewayList.length) {
    problems.push(`UPC_GATEWAY_SIGNATURE_ALGS съдържа непознат алгоритъм: "${gatewayRaw}".`);
  }

  const protocolRaw = (env.UPC_STATUS_PROTOCOL ?? "").trim().toLowerCase() || "json";
  if (protocolRaw !== "json" && protocolRaw !== "text") {
    problems.push(`UPC_STATUS_PROTOCOL е непознат: "${protocolRaw}" (json | text).`);
  }
  const statusProtocol: "json" | "text" = protocolRaw === "text" ? "text" : "json";

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
      statusProtocol,
      gatewayCertSha256: sha256Fingerprint(gatewayPem),
      gatewayCertIsDefault: !explicitGatewayCert,
    },
  };
}
