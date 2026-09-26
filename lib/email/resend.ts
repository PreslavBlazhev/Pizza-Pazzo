/**
 * Transactional email via Resend — SERVER ONLY.
 *
 * Every sender here is best-effort towards the ORDER: a failed e-mail never
 * breaks placing an order or changing its status. But it is not silent any
 * more: each sender returns an {@link EmailOutcome}, so the caller can record
 * whether the message really left (see notifyRestaurantOnce).
 *
 * Real delivery is switched off:
 *   - always on a STAGING deployment (APP_ENV=staging) — the test shop must
 *     never write to the restaurant's inbox or to a customer;
 *   - anywhere with EMAIL_DELIVERY=disabled;
 *   - when RESEND_API_KEY / FROM_EMAIL (/ ORDER_NOTIFICATION_EMAIL) are missing.
 */
import { Resend } from "resend";
import { newOrderEmail, type NewOrderEmailData } from "@/lib/email-templates/new-order";
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import { getRestaurantSettings } from "@/lib/restaurant-settings";
import { getAppEnv } from "@/lib/app-env";
import type { Order, OrderWithItems } from "@/types/order";

/** What happened to one e-mail. `error`/`reason` never contain secrets. */
export type EmailOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/** Just enough validation to skip obviously broken addresses before calling Resend. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why real delivery is off in this process, or null when it is on. */
export function emailDeliveryBlockedReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (getAppEnv(env) === "staging") return "staging: реалното изпращане на имейли е изключено";
  if ((env.EMAIL_DELIVERY ?? "").trim().toLowerCase() === "disabled") {
    return "EMAIL_DELIVERY=disabled";
  }
  return null;
}

/** A short, loggable description of a Resend error — no keys, no bodies. */
function describe(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { name?: unknown; message?: unknown; statusCode?: unknown };
    const parts = [e.name, e.statusCode, e.message].filter((p) => p !== undefined && p !== null);
    if (parts.length > 0) return parts.map(String).join(" ").slice(0, 300);
  }
  return String(error).slice(0, 300);
}

/**
 * Best-effort send of a prebuilt message to the order's customer. Skips (with a
 * log line) when delivery is off, Resend isn't configured or the address is
 * missing/invalid; never throws — a failed email must never undo a status change.
 */
async function sendToCustomer(
  order: Order,
  message: { subject: string; html: string; text: string },
  kind: string
): Promise<EmailOutcome> {
  const blocked = emailDeliveryBlockedReason();
  if (blocked) {
    console.warn(`[email] ${blocked} — skipping "${kind}" email for order #${order.orderNumber}`);
    return { status: "skipped", reason: blocked };
  }
  if (order.isTest) {
    return { status: "skipped", reason: "тестова поръчка" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      `[email] Resend not configured (RESEND_API_KEY/FROM_EMAIL) — ` +
        `skipping "${kind}" email for order #${order.orderNumber}`
    );
    return { status: "skipped", reason: "Resend не е конфигуриран" };
  }
  if (!order.customerEmail || !EMAIL_RE.test(order.customerEmail)) {
    console.warn(
      `[email] order #${order.orderNumber} has no valid customer email — skipping "${kind}" email`
    );
    return { status: "skipped", reason: "няма валиден имейл на клиента" };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send(
      {
        from,
        to: order.customerEmail,
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      // The same e-mail for the same order is sent at most once by Resend,
      // even if we ever call this twice (24-hour idempotency window).
      { idempotencyKey: `pp-${kind}-${order.id}` }
    );
    if (error) {
      console.error(`[email] Resend rejected "${kind}" email for order #${order.orderNumber}:`, describe(error));
      return { status: "failed", error: describe(error) };
    }
    return { status: "sent" };
  } catch (err) {
    console.error(`[email] failed to send "${kind}" email for order #${order.orderNumber}:`, describe(err));
    return { status: "failed", error: describe(err) };
  }
}

/**
 * Tells the customer their order was accepted — the only email a customer ever
 * gets. Carries the full order (items, totals, address) and the estimated time
 * the staff picked. Skipped silently when the customer gave no email.
 */
export async function sendCustomerOrderAcceptedEmail(order: OrderWithItems): Promise<EmailOutcome> {
  // The signature phone comes from the admin-editable settings, read through
  // the same cached helper the site uses — so changing it in Admin → Settings
  // takes effect on the next email, with no deploy. Only the CONTENT is
  // affected: the Resend sender and recipient stay environment-driven.
  const settings = await getRestaurantSettings();
  return sendToCustomer(
    order,
    customerOrderAcceptedEmail(order, { phone: settings.primaryPhone }),
    "accepted"
  );
}

/**
 * Notifies the restaurant inbox about a newly placed order.
 *
 * `idempotencyKey` should be stable per order (notifyRestaurantOnce passes
 * one): if the process dies between Resend accepting the message and us
 * recording it, the retry is recognised by Resend instead of delivered twice.
 */
export async function sendNewOrderNotification(
  data: NewOrderEmailData,
  options: { idempotencyKey?: string } = {}
): Promise<EmailOutcome> {
  const blocked = emailDeliveryBlockedReason();
  if (blocked) {
    console.warn(`[email] ${blocked} — skipping notification for order #${data.orderNumber}`);
    return { status: "skipped", reason: blocked };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_NOTIFICATION_EMAIL;
  const from = process.env.FROM_EMAIL;

  if (!apiKey || !to || !from) {
    console.warn(
      `[email] Resend not configured (RESEND_API_KEY/ORDER_NOTIFICATION_EMAIL/FROM_EMAIL) — ` +
        `skipping notification for order #${data.orderNumber}`
    );
    return { status: "skipped", reason: "Resend не е конфигуриран" };
  }

  try {
    const resend = new Resend(apiKey);
    const { subject, html, text } = newOrderEmail(data);
    const { error } = await resend.emails.send(
      {
        from,
        to,
        subject,
        html,
        text,
        replyTo: data.customerEmail || undefined,
      },
      options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
    );
    if (error) {
      console.error(`[email] Resend rejected order #${data.orderNumber} notification:`, describe(error));
      return { status: "failed", error: describe(error) };
    }
    return { status: "sent" };
  } catch (err) {
    console.error(`[email] failed to send order #${data.orderNumber} notification:`, describe(err));
    return { status: "failed", error: describe(err) };
  }
}
