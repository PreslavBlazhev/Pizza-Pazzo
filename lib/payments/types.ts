/**
 * The seam between the restaurant and whoever moves the money.
 *
 * The order/kitchen logic (lib/payments/service.ts) only ever talks to this
 * interface. A provider adapter translates it to one concrete protocol — the
 * test simulator today, the chosen bank's gateway once its documentation and
 * sandbox access exist. Nothing outside lib/payments/providers/ may know a
 * provider's endpoints, field names or status codes.
 *
 * The contract every adapter must honour:
 *   - Card data never passes through here. The customer types the card only
 *     on the provider's hosted page.
 *   - `getStatus` is a server-to-server call and is the ONLY source of truth
 *     for "paid". Callbacks and return URLs merely tell us to ask.
 *   - `getStatus` reports the amount and currency the provider actually
 *     confirmed, so the service can compare them with what was charged.
 *   - `safeDetails` must already be stripped of card data and secrets.
 *   - Never log credentials, tokens or request bodies that contain them.
 */
import type { PaymentEnvironment } from "./config";
import type { ProviderPaymentState } from "./status";

export interface CreateSessionInput {
  /** Our unique reference (PaymentAttempt.reference) — the provider's order number. */
  reference: string;
  amountMinor: number;
  currency: string;
  /** Short human text for the hosted page, e.g. "Pizza Pazzo — поръчка №1012". */
  description: string;
  /** Where the customer's browser comes back to — success and failure alike. */
  returnUrl: string;
  /** Where the provider notifies us server-to-server (if it supports that). */
  callbackUrl: string;
  locale: "bg" | "en";
}

export interface CreateSessionResult {
  providerPaymentId: string;
  /** Absolute HTTPS URL of the hosted payment page. */
  redirectUrl: string;
  /**
   * Set when the hosted page must be opened with a form POST of these exact
   * fields (BORICA- and UPC-style gateways sign the request and expect the
   * customer's browser to post it). Omitted = a plain GET of `redirectUrl`.
   * Signed request fields only — never a secret, never card data.
   */
  postFields?: Record<string, string>;
  safeDetails?: Record<string, unknown>;
}

export interface StatusQuery {
  reference: string;
  providerPaymentId: string | null;
}

export interface StatusResult {
  state: ProviderPaymentState;
  /** The provider's own code, verbatim (for the admin and the logs). */
  rawStatus: string;
  /** What the provider says was charged. Undefined = it did not say. */
  amountMinor?: number;
  currency?: string;
  /** Short, customer-safe reason for a failure (no codes that leak internals). */
  failureReason?: string;
  /** The provider's id, when a query by reference is how we first learn it. */
  providerPaymentId?: string;
  safeDetails?: Record<string, unknown>;
}

/** A provider callback, reduced to what we need to find the attempt. */
export interface CallbackRequest {
  method: string;
  headers: Headers;
  query: URLSearchParams;
  bodyText: string;
}

export interface CallbackIdentification {
  /** False when the provider's protocol has a signature and it did not verify. */
  authentic: boolean;
  reference?: string;
  providerPaymentId?: string;
}

export interface PaymentProvider {
  /** Stored in PaymentAttempt.provider, e.g. "SIMULATOR". */
  readonly id: string;
  /** Name customers see on the review screen, e.g. "тестов симулатор". */
  readonly displayName: { bg: string; en: string };
  readonly environment: PaymentEnvironment;
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  getStatus(query: StatusQuery): Promise<StatusResult>;
  identifyCallback(request: CallbackRequest): Promise<CallbackIdentification>;
}

/**
 * Thrown for a problem the customer cannot fix (misconfiguration, provider down).
 *
 * `outcome` matters only for createSession and is the adapter's promise:
 *   "rejected" — the provider definitely did NOT register a payment (a
 *                validation error it answered with, or we never sent the
 *                request). A new session may be opened.
 *   "unknown"  — the request may have reached the provider (timeout, dropped
 *                connection, an unreadable answer). The attempt is kept OPEN
 *                and checked by reference before anything else happens, so a
 *                second session is never opened blindly next to a first one
 *                that might be payable.
 * When an adapter cannot tell, it must say "unknown".
 */
export class PaymentProviderError extends Error {
  readonly outcome: "rejected" | "unknown";
  constructor(message: string, outcome: "rejected" | "unknown" = "unknown") {
    super(message);
    this.name = "PaymentProviderError";
    this.outcome = outcome;
  }
}
