/**
 * The customer's browser coming back from UPC to SUCCESS_URL / FAILURE_URL.
 * SERVER ONLY.
 *
 * The URLs are fixed in ОББ's portal (they cannot carry our order's access
 * token), so the browser brings UPC's own POST: OrderID, TranCode, … and
 * UPC's signature. Nothing in it is trusted to mark an order paid — even a
 * correctly signed "000" here only triggers the server-to-server status
 * query (syncAttempt). The signature decides just one thing: whether this
 * browser may be sent on to the order's own status page (which needs the
 * order's access token). An unsigned or unknown return lands on the neutral
 * "checking" page, which finds the order from the tab's own sessionStorage.
 */
import { db } from "@/lib/db";
import { getEffectivePaymentConfig } from "../providers";
import { UPC_PROVIDER_ID, verifyUpcMessage } from "../providers/upc";
import { syncAttempt } from "../service";
import { getUpcSettings } from "./config";
import { parseFormBody } from "./protocol";

export interface BrowserReturnTarget {
  /** Path + query under the site's base URL. */
  path: string;
  verified: boolean;
}

export async function resolveUpcBrowserReturn(
  kind: "success" | "failure",
  rawFields: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<BrowserReturnTarget> {
  const neutral: BrowserReturnTarget = { path: "/payment/return", verified: false };
  const fields = parseFormBody(rawFields);
  if (!fields.OrderID) return neutral;

  const config = getEffectivePaymentConfig({ ...env, CARD_PAYMENTS_ENABLED: "true" });
  const { settings } = getUpcSettings(config.environment, env);
  if (config.providerId !== "upc" || !settings) return neutral;

  const v = verifyUpcMessage(settings, fields, { allowFailureForm: kind === "failure" });
  if (!v.ok) {
    console.warn(`[payments] UPC ${kind} return for ${fields.OrderID.slice(0, 20)} not verified (${v.reason})`);
    return neutral;
  }

  const attempt = await db.paymentAttempt.findUnique({ where: { reference: fields.OrderID } });
  if (!attempt || attempt.provider !== UPC_PROVIDER_ID || attempt.environment !== config.environment) {
    return neutral;
  }
  const order = await db.order.findUnique({ where: { id: attempt.orderId }, select: { accessToken: true } });
  if (!order?.accessToken) return neutral;

  try {
    // Ask the gateway now; NOTIFY has normally settled it already.
    await syncAttempt(attempt.id, { minIntervalMs: 0 });
  } catch (err) {
    console.warn(`[payments] UPC ${kind} return: status check failed: ${(err as Error).message}`);
  }
  const prefix = attempt.locale === "en" ? "/en" : "";
  return { path: `${prefix}/payment/return?t=${encodeURIComponent(order.accessToken)}`, verified: true };
}
