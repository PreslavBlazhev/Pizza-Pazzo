/**
 * Apple Pay on the web — merchant validation. SERVER ONLY.
 *
 * Apple's flow (developer.apple.com → Apple Pay on the Web → "Providing
 * merchant validation" / "Requesting an Apple Pay payment session"):
 *   1. Safari fires `onvalidatemerchant` with a validationURL on Apple's servers.
 *   2. OUR SERVER posts { merchantIdentifier, displayName, initiative: "web",
 *      initiativeContext: <verified domain> } to that URL over mutual TLS,
 *      authenticated with the Merchant Identity certificate.
 *   3. Apple's opaque merchant session goes back to the page untouched
 *      (completeMerchantValidation). It is never logged or stored.
 *
 * The URL comes from the browser, so it is checked against Apple's published
 * list of Apple Pay gateway hosts before anything is sent — otherwise our
 * client certificate could be pointed at any server.
 */
import { request as httpsRequest } from "node:https";
import type { ApplePaySettings } from "./config";

/**
 * Apple's documented merchant-validation hosts ("Setting up your server"):
 * apple-pay-gateway.apple.com, apple-pay-gateway-{nc,pr}-pod{N}.apple.com,
 * cn-apple-pay-gateway.apple.com, cn-apple-pay-gateway-{sh,tj}-pod{N}.apple.com
 * and the sandbox hosts apple-pay-gateway-cert.apple.com /
 * cn-apple-pay-gateway-cert.apple.com.
 */
const APPLE_GATEWAY_HOST =
  /^(apple-pay-gateway(-(nc|pr)-pod\d{1,2}|-cert)?|cn-apple-pay-gateway(-(sh|tj)-pod\d{1,2}|-cert)?)\.apple\.com$/;
const APPLE_SESSION_PATH = /^\/paymentservices\/(startSession|paymentSession)$/;

export function isAppleValidationUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 300) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.port === "" || url.port === "443") &&
      !url.search &&
      APPLE_GATEWAY_HOST.test(url.hostname) &&
      APPLE_SESSION_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export type MerchantSessionPoster = (
  url: string,
  body: string,
  tls: { cert: string; key: string }
) => Promise<{ status: number; text: string }>;

const TIMEOUT_MS = 10_000;

const postWithClientCertificate: MerchantSessionPoster = (url, body, tls) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "POST",
        cert: tls.cert,
        key: tls.key,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > 64_000) req.destroy(new Error("answer too large"));
          else chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });

/** Apple's opaque merchant session object, or null (reason logged, nothing secret). */
export async function requestAppleMerchantSession(
  settings: ApplePaySettings,
  validationUrl: string,
  post: MerchantSessionPoster = postWithClientCertificate
): Promise<Record<string, unknown> | null> {
  if (!isAppleValidationUrl(validationUrl)) return null;
  const body = JSON.stringify({
    merchantIdentifier: settings.merchantIdentifier,
    displayName: settings.displayName,
    initiative: "web",
    initiativeContext: settings.domain,
  });
  try {
    const res = await post(validationUrl, body, { cert: settings.identityCertPem, key: settings.identityKeyPem });
    if (res.status < 200 || res.status >= 300) {
      console.warn(`[payments] Apple Pay merchant validation refused: HTTP ${res.status}`);
      return null;
    }
    const session = JSON.parse(res.text) as unknown;
    if (!session || typeof session !== "object" || Array.isArray(session)) return null;
    return session as Record<string, unknown>;
  } catch (err) {
    console.warn(`[payments] Apple Pay merchant validation failed: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}
