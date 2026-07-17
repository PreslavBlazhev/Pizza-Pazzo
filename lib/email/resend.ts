/**
 * Transactional email via Resend — SERVER ONLY.
 *
 * Every sender here is best-effort: if RESEND_API_KEY (or the from/to env vars)
 * is missing, or the API call fails, we log and return WITHOUT throwing — a
 * failed notification must never break placing an order.
 */
import { Resend } from "resend";
import { newOrderEmail, type NewOrderEmailData } from "@/lib/email-templates/new-order";

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
      replyTo: data.customerEmail,
    });
    if (error) {
      console.error(`[email] Resend rejected order #${data.orderNumber} notification:`, error);
    }
  } catch (err) {
    console.error(`[email] failed to send order #${data.orderNumber} notification:`, err);
  }
}
