/**
 * Customer-facing "order accepted" email. Sent to the customer when staff
 * accepts their order with an estimated delivery time. Bulgarian — the
 * restaurant's customers order in BG and the order itself stores no locale.
 */
import { SITE } from "@/lib/constants";

export interface CustomerOrderAcceptedData {
  orderNumber: number;
  customerName: string;
  estimatedTimeMinutes: number;
  totalBgn: number;
  totalEur: number;
  deliveryAddress: string;
  deliveryCity: string;
}

const bgn = (n: number) => `${n.toFixed(2)} лв.`;
const eur = (n: number) => `${n.toFixed(2)} €`;

/** Minimal HTML escaping for customer-supplied strings. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function customerOrderAcceptedEmail(data: CustomerOrderAcceptedData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Поръчката ви е приета — Pizza Pazzo #${data.orderNumber}`;

  const text = [
    `Здравейте, ${data.customerName}!`,
    ``,
    `Благодарим ви за поръчката! Поръчка #${data.orderNumber} е приета.`,
    ``,
    `Ориентировъчно време за доставка: около ${data.estimatedTimeMinutes} минути.`,
    `Обща сума: ${eur(data.totalEur)} / ${bgn(data.totalBgn)} (наложен платеж)`,
    `Адрес за доставка: ${data.deliveryAddress}, ${data.deliveryCity}`,
    ``,
    `Ще се свържем с вас при нужда.`,
    ``,
    `Pizza Pazzo · ${SITE.phone}`,
  ].join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <h2 style="color:#27ae60;">Поръчка #${data.orderNumber} е приета ✔</h2>
  <p>Здравейте, ${esc(data.customerName)}!</p>
  <p>Благодарим ви за поръчката! Приготвяме я.</p>
  <p style="margin:4px 0;"><strong>Ориентировъчно време за доставка:</strong> около ${data.estimatedTimeMinutes} минути</p>
  <p style="margin:4px 0;"><strong>Обща сума:</strong> ${eur(data.totalEur)} <span style="color:#888;">/ ${bgn(data.totalBgn)}</span> (наложен платеж)</p>
  <p style="margin:4px 0;"><strong>Адрес за доставка:</strong> ${esc(data.deliveryAddress)}, ${esc(data.deliveryCity)}</p>
  <p>Ще се свържем с вас при нужда.</p>
  <p style="color:#888;">Pizza Pazzo · тел. ${SITE.phone}</p>
</div>`;

  return { subject, html, text };
}
