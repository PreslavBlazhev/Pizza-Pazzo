/**
 * Customer-facing "order cancelled" email. Sent to the customer when staff
 * cancels their order, with the reason when one was given. Bulgarian.
 */
import { SITE } from "@/lib/constants";

export interface CustomerOrderCancelledData {
  orderNumber: number;
  customerName: string;
  /** Reason for the cancellation (adminNote); omitted from the email when empty. */
  reason?: string | null;
}

/** Minimal HTML escaping for customer-supplied strings. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function customerOrderCancelledEmail(data: CustomerOrderCancelledData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Поръчката ви е отказана — Pizza Pazzo #${data.orderNumber}`;

  const text = [
    `Здравейте, ${data.customerName},`,
    ``,
    `За съжаление поръчка #${data.orderNumber} беше отказана.`,
    data.reason ? `Причина: ${data.reason}` : ``,
    ``,
    `Искрено се извиняваме за неудобството. Ако имате въпроси, свържете се с нас на ${SITE.phone}.`,
    ``,
    `Pizza Pazzo`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <h2 style="color:#c0392b;">Поръчка #${data.orderNumber} е отказана</h2>
  <p>Здравейте, ${esc(data.customerName)},</p>
  <p>За съжаление поръчката ви беше отказана.</p>
  ${data.reason ? `<p style="margin:4px 0;"><strong>Причина:</strong> ${esc(data.reason)}</p>` : ""}
  <p>Искрено се извиняваме за неудобството. Ако имате въпроси, свържете се с нас на тел. ${SITE.phone}.</p>
  <p style="color:#888;">Pizza Pazzo</p>
</div>`;

  return { subject, html, text };
}
