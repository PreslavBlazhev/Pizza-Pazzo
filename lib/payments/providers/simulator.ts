/**
 * Payment SIMULATOR — a stand-in bank for development and staging.
 *
 * It behaves like a hosted-page gateway, end to end:
 *   createSession → a row in its own ledger (PaymentSimulatorSession) and a
 *                   "hosted page" at /payment-simulator/<id>
 *   the page      → the tester picks an outcome; the simulator records it,
 *                   sends a SIGNED callback and sends the browser back
 *   getStatus     → reads its own ledger, exactly as a bank's status API would
 *
 * The rest of the system cannot tell it from a bank, which is the point: the
 * order becomes PAID only through the same getStatus verification a real
 * provider will go through. Choosing "paid" on the simulator page never marks
 * an order as anything — it only changes the simulator's own ledger.
 *
 * It can only exist where lib/payments/config allows it (APP_ENV development
 * or staging); in production the registry refuses to build it and the hosted
 * page returns 404.
 *
 * ⚠️ NOT a bank test. Passing through the simulator proves our side of the
 * flow; it proves nothing about any bank's protocol.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { PaymentConfig } from "../config";
import {
  PaymentProviderError,
  type CallbackIdentification,
  type CallbackRequest,
  type CreateSessionInput,
  type CreateSessionResult,
  type PaymentProvider,
  type StatusQuery,
  type StatusResult,
} from "../types";

export const SIMULATOR_PROVIDER_ID = "SIMULATOR";
export const SIMULATOR_SIGNATURE_HEADER = "x-pp-simulator-signature";

/** An untouched hosted page expires like a bank session would. */
export const SIMULATOR_SESSION_TTL_MS = 30 * 60 * 1000;

/** Ledger states. OPEN = the tester has not chosen anything yet. */
export const SIMULATOR_STATES = [
  "OPEN",
  "PAID",
  "DECLINED",
  "CANCELLED",
  "PENDING",
  "UNREACHABLE",
] as const;
export type SimulatorState = (typeof SIMULATOR_STATES)[number];

/**
 * What the tester can choose on the hosted page. Each one reproduces a real
 * situation the order flow has to survive.
 */
export const SIMULATOR_SCENARIOS = {
  paid: { bg: "Успешно плащане", state: "PAID" },
  declined: { bg: "Отказана карта", state: "DECLINED" },
  cancelled: { bg: "Клиентът се отказва на страницата на банката", state: "CANCELLED" },
  pending: { bg: "Чакащо — банката още не е решила (остава чакащо)", state: "PENDING" },
  latePaid: {
    bg: "Чакащо, потвърдено като платено след 20 секунди",
    state: "PENDING",
    later: "PAID",
  },
  lateAfterDecline: {
    bg: "Изглежда отказано, но банката го потвърждава след 20 секунди",
    state: "DECLINED",
    later: "PAID",
  },
  unreachable: {
    bg: "Банката не отговаря (timeout) 20 секунди, после платено",
    state: "UNREACHABLE",
    later: "PAID",
  },
  duplicateCallback: { bg: "Успешно + 3 едновременни повторени callback-а", state: "PAID" },
  amountMismatch: { bg: "„Платено“, но с различна сума (+0,01 €)", state: "PAID" },
} as const satisfies Record<string, { bg: string; state: SimulatorState; later?: SimulatorState }>;
export type SimulatorScenario = keyof typeof SIMULATOR_SCENARIOS;

export const SIMULATOR_LATE_DELAY_MS = 20_000;

export function signSimulatorBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(signSimulatorBody(body, secret), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Ledger state → the provider-agnostic outcome the service understands. */
export function mapSimulatorState(
  state: string,
  createdAt: Date,
  now: Date = new Date()
): StatusResult["state"] {
  switch (state) {
    case "PAID":
      return "PAID";
    case "DECLINED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    case "PENDING":
      return "PENDING";
    case "OPEN":
      return now.getTime() - createdAt.getTime() > SIMULATOR_SESSION_TTL_MS
        ? "EXPIRED"
        : "PENDING";
    default:
      return "PENDING";
  }
}

export function createSimulatorProvider(config: PaymentConfig): PaymentProvider {
  const baseUrl = config.baseUrl;

  return {
    id: SIMULATOR_PROVIDER_ID,
    displayName: { bg: "тестов симулатор (без реални пари)", en: "test simulator (no real money)" },
    environment: "simulator",

    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      const session = await db.paymentSimulatorSession.create({
        data: {
          reference: input.reference,
          amountMinor: input.amountMinor,
          currency: input.currency,
          description: input.description.slice(0, 200),
          returnUrl: input.returnUrl,
          callbackUrl: input.callbackUrl,
        },
      });
      return {
        providerPaymentId: session.id,
        redirectUrl: `${baseUrl}${input.locale === "en" ? "/en" : ""}/payment-simulator/${session.id}`,
        safeDetails: { simulatorSession: session.id },
      };
    },

    async getStatus(query: StatusQuery): Promise<StatusResult> {
      let session = query.providerPaymentId
        ? await db.paymentSimulatorSession.findUnique({ where: { id: query.providerPaymentId } })
        : await db.paymentSimulatorSession.findUnique({ where: { reference: query.reference } });
      if (!session) {
        throw new PaymentProviderError(`Симулаторът не познава ${query.reference}.`);
      }

      // Delayed outcomes resolve when they are asked about after their time,
      // the way a bank's answer changes between two status queries.
      if (session.resolveAt && session.resolveTo && session.resolveAt <= new Date()) {
        session = await db.paymentSimulatorSession.update({
          where: { id: session.id },
          data: { state: session.resolveTo, resolveAt: null, resolveTo: null },
        });
      }

      if (session.state === "UNREACHABLE") {
        throw new PaymentProviderError("Симулирана липса на връзка с банката (timeout).");
      }

      const state = mapSimulatorState(session.state, session.createdAt);
      return {
        state,
        rawStatus: session.state,
        amountMinor: session.amountMinor,
        currency: session.currency,
        failureReason:
          state === "FAILED" ? "Картата е отказана (симулация)." : undefined,
        safeDetails: { simulatorState: session.state },
      };
    },

    async identifyCallback(request: CallbackRequest): Promise<CallbackIdentification> {
      const authentic = verifySignature(
        request.bodyText,
        request.headers.get(SIMULATOR_SIGNATURE_HEADER),
        config.simulatorSecret
      );
      let parsed: { reference?: unknown; providerPaymentId?: unknown } = {};
      try {
        parsed = JSON.parse(request.bodyText || "{}");
      } catch {
        parsed = {};
      }
      return {
        authentic,
        reference: typeof parsed.reference === "string" ? parsed.reference : undefined,
        providerPaymentId:
          typeof parsed.providerPaymentId === "string" ? parsed.providerPaymentId : undefined,
      };
    },
  };
}

/**
 * What the hosted simulator page does when the tester picks an outcome:
 * write the ledger (the "bank" side) and hand back where the browser goes.
 * The order itself is untouched here.
 */
export async function recordSimulatorOutcome(
  sessionId: string,
  scenario: SimulatorScenario
): Promise<{ returnUrl: string; callbackUrl: string | null; reference: string } | null> {
  const session = await db.paymentSimulatorSession.findUnique({ where: { id: sessionId } });
  // Only an untouched session can be decided — like a bank page that has
  // already been submitted, pressing back and choosing again does nothing.
  if (!session || session.state !== "OPEN") return null;
  if (mapSimulatorState(session.state, session.createdAt) === "EXPIRED") return null;

  const def = SIMULATOR_SCENARIOS[scenario];
  const later = "later" in def ? def.later : undefined;
  const { count } = await db.paymentSimulatorSession.updateMany({
    where: { id: sessionId, state: "OPEN" },
    data: {
      state: def.state,
      resolveAt: later ? new Date(Date.now() + SIMULATOR_LATE_DELAY_MS) : null,
      resolveTo: later ?? null,
      ...(scenario === "amountMismatch" && { amountMinor: session.amountMinor + 1 }),
    },
  });
  if (count !== 1) return null;

  return {
    returnUrl: session.returnUrl,
    callbackUrl: session.callbackUrl,
    reference: session.reference,
  };
}

/** Sends one signed simulator callback. Best-effort, like a real bank's. */
export async function sendSimulatorCallback(
  callbackUrl: string,
  payload: { reference: string; providerPaymentId: string },
  secret: string
): Promise<void> {
  const body = JSON.stringify(payload);
  try {
    await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIMULATOR_SIGNATURE_HEADER]: signSimulatorBody(body, secret),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn(
      `[payments/simulator] callback to ${callbackUrl} failed: ${(err as Error).message}`
    );
  }
}
