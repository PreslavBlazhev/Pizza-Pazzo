/**
 * Transactional email via Resend — SERVER ONLY.
 *
 * Every sender here is best-effort: if RESEND_API_KEY (or the from/to env vars)
 * is missing, or the API call fails, we log and return WITHOUT throwing — a
 * failed notification must never break placing an order.
 */
import { Resend } from "resend";
import { newOrderEmail, type NewOrderEmailData } from "@/lib/email-templates/new-order";
import { customerOrderAcceptedEmail } from "@/lib/email-templates/customer-order-accepted";
import type { Order, OrderWithItems } from "@/types/order";

/** Just enough validation to skip obviously broken addresses before calling Resend. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Best-effort send of a prebuilt message to the order's customer. Skips (with a
 * log line) when Resend isn't configured or the address is missing/invalid;
 * never throws — a failed email must never undo a status change.
 */
async function sendToCustomer(
  order: Order,
  message: { subject: string; html: string; text: string },
  kind: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      `[email] Resend not configured (RESEND_API_KEY/FROM_EMAIL) — ` +
        `skipping "${kind}" email for order #${order.orderNumber}`
    );
    return;
  }
  if (!order.customerEmail || !EMAIL_RE.test(order.customerEmail)) {
    console.warn(
      `[email] order #${order.orderNumber} has no valid customer email — skipping "${kind}" email`
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: order.customerEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      console.error(`[email] Resend rejected "${kind}" email for order #${order.orderNumber}:`, error);
    }
  } catch (err) {
    console.error(`[email] failed to send "${kind}" email for order #${order.orderNumber}:`, err);
  }
}

/**
 * Tells the customer their order was accepted — the only email a customer ever
 * gets. Carries the full order (items, totals, address) and the estimated time
 * the staff picked. Skipped silently when the customer gave no email.
 */
export async function sendCustomerOrderAcceptedEmail(order: OrderWithItems): Promise<void> {
  await sendToCustomer(order, customerOrderAcceptedEmail(order), "accepted");
}

/** Notifies the restaurant inbox about a newly placed order. */
export async function sendNewOrderNotification(data: NewOrderEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_NOTIFICATION_EMAIL;
  const from = process.env.FROM_EMAIL;

  if (!apiKey || !to || !from) {
    console.warn(
      `[email] Resend not configured (RESEND_API_KEY/ORDER_NOTIFICATION_EMAIL/FROM_EMAIL) — ` +
        `skipping notification for order #${data.orderNumber}`
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { subject, html, text } = newOrderEmail(data);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      replyTo: data.customerEmail || undefined,
    });
    if (error) {
      console.error(`[email] Resend rejected order #${data.orderNumber} notification:`, error);
    }
  } catch (err) {
    console.error(`[email] failed to send order #${data.orderNumber} notification:`, err);
  }
}
