/**
 * Placeholder for the REAL bank adapter (PAYMENT_PROVIDER=bank).
 *
 * The bank is ОББ (virtual POS), but its TECHNICAL INTERFACE for this
 * terminal has not been provided. ОББ runs virtual POS terminals on two
 * different platforms — BORICA and UPC (ubb.bg, virtual POS page, 2026) —
 * with different protocols, signatures and endpoints, and its general terms
 * (т. 14.1) oblige the bank to hand the merchant the specification. Until it
 * arrives, no protocol is guessed here: selecting this provider keeps card
 * payments switched OFF with an explicit reason in the admin.
 * What is missing, exactly: docs/UBB-VPOS-INTEGRATION.md §6.
 *
 * Both candidate platforms open their hosted page with a signed form POST —
 * return it as CreateSessionResult.postFields; /api/payments/start posts it.
 * If session creation is a server call and it times out, throw
 * PaymentProviderError(…, "unknown"); only a definite refusal is "rejected".
 * getStatus must answer a query by REFERENCE alone (providerPaymentId null)
 * and say NOT_FOUND only when the gateway positively has no such order.
 *
 * When the bank's official integration documentation and sandbox access
 * arrive, replace `bankConfigProblems` and `createBankProvider` with the real
 * implementation of the PaymentProvider contract in ../types.ts:
 *
 *   createSession  register the order at the gateway with our `reference`,
 *                  `amountMinor`, `currency`, `returnUrl` (and the failure
 *                  URL if the bank has a separate one — pass `returnUrl`, our
 *                  return handler treats both the same) and `callbackUrl` if
 *                  the bank supports dynamic callbacks; return the gateway's
 *                  id and hosted-page URL.
 *   getStatus      the gateway's server-to-server status query. Map ONLY the
 *                  bank's "fully paid / deposited" state to "PAID" — an
 *                  authorization hold is not money until the contract says
 *                  capture is automatic. Return the amount and currency the
 *                  bank reports. Strip every card field (masked PAN, holder,
 *                  expiry, 3-DS data) from `safeDetails`.
 *   identifyCallback  verify the callback exactly as the bank's protocol
 *                  prescribes (checksum/signature/mTLS) and pull out our
 *                  reference or the bank's id. Even an authentic callback only
 *                  triggers getStatus — it never marks anything paid itself.
 *
 * Read credentials from env (e.g. BANK_API_URL, BANK_MERCHANT_ID,
 * BANK_API_USERNAME, BANK_API_PASSWORD / BANK_CALLBACK_SECRET — the real
 * names follow the bank's docs), never log them, and add them to
 * .env.example and docs/online-card-payments.md. Checklist of what to ask
 * the bank: docs/bank-meeting-checklist.md.
 */
import { PaymentProviderError, type PaymentProvider } from "../types";

export const BANK_PROVIDER_ID = "BANK";

/**
 * Configuration problems for the bank adapter — pure. The real adapter will
 * take (env) and report its own missing variables; the placeholder has none
 * to check, only the fact that it does not exist yet.
 */
export function bankConfigProblems(): string[] {
  return [
    "Адаптерът за ОББ не е реализиран: няма техническа спецификация за терминала (платформа BORICA или UPC, адреси, идентификатори, подписване) и няма тестов достъп — вижте docs/UBB-VPOS-INTEGRATION.md.",
  ];
}

export function createBankProvider(): PaymentProvider {
  throw new PaymentProviderError(
    "Адаптерът за банката не е реализиран — вижте lib/payments/providers/bank.ts."
  );
}
