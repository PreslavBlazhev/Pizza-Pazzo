"use server";

import { redirect } from "next/navigation";
import { getSimulatorConfig } from "@/lib/payments/providers";
import {
  recordSimulatorOutcome,
  sendSimulatorCallback,
  SIMULATOR_LATE_DELAY_MS,
  SIMULATOR_SCENARIOS,
  type SimulatorScenario,
} from "@/lib/payments/providers/simulator";

/**
 * The tester's choice on the simulator's hosted page. Plays the BANK: writes
 * the simulator's own ledger, sends the bank-style signed callback and sends
 * the browser back to the shop. It never touches an order — the order moves
 * only when our normal verification reads the ledger back.
 *
 * Refused outright unless the simulator may run here: the environment
 * simulator (development/staging), or the live-site card demo switched on in
 * Admin → Settings (lib/payments/demo.ts).
 */
export async function simulatorDecideAction(formData: FormData): Promise<void> {
  const config = await getSimulatorConfig();
  if (!config) {
    throw new Error("Payment simulator is not available here.");
  }

  const sessionId = String(formData.get("sessionId") ?? "");
  const scenario = String(formData.get("scenario") ?? "") as SimulatorScenario;
  if (!(scenario in SIMULATOR_SCENARIOS)) throw new Error("Unknown simulator scenario.");

  const outcome = await recordSimulatorOutcome(sessionId, scenario);
  if (!outcome) {
    // Already decided or expired: behave like a used bank page — back to the shop.
    redirect("/");
  }

  const payload = { reference: outcome.reference, providerPaymentId: sessionId };
  const def = SIMULATOR_SCENARIOS[scenario];
  const later = "later" in def;

  if (outcome.callbackUrl) {
    const url = outcome.callbackUrl;
    const secret = config.simulatorSecret;
    if (scenario === "duplicateCallback") {
      // A bank retrying its notification, all at once.
      await Promise.all([1, 2, 3].map(() => sendSimulatorCallback(url, payload, secret)));
    } else if (def.state !== "PENDING" && def.state !== "UNREACHABLE") {
      await sendSimulatorCallback(url, payload, secret);
    }
    if (later) {
      // The bank's later notification, after the customer has already been
      // sent back. Fire-and-forget on a long-running server (dev / staging).
      setTimeout(() => void sendSimulatorCallback(url, payload, secret), SIMULATOR_LATE_DELAY_MS + 1000);
    }
  }

  redirect(outcome.returnUrl);
}
