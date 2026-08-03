/**
 * Restaurant-facing "new order" notification. Sent to the order inbox
 * (ORDER_NOTIFICATION_EMAIL) whenever a customer places an order. Bulgarian —
 * this is read by staff.
 */

import type { OrderItemExtra } from "@/lib/extras-rules";
import { extraKitchenLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";

export interface NewOrderEmailItem {
  nameBg: string;
  variantName?: string | null;
  quantity: number;
  totalPriceEur: number;
  /** Chosen extras (order snapshot). Optional so legacy callers keep working. */
  extras?: OrderItemExtra[];
}

export interface NewOrderEmailData {
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryCity: string;
  deliveryAddress: string;
  deliveryNote?: string | null;
  totalEur: number;
  items: NewOrderEmailItem[];
}

const eur = (n: number) => `${n.toFixed(2)} €`;

export function newOrderEmail(data: NewOrderEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Нова поръчка #${data.orderNumber} — Pizza Pazzo`;

  // Extras go on their own indented lines under the dish; "/ всяка" marks that
  // they apply to every unit of a multi-quantity line (staff read this).
  const itemLines = data.items.flatMap((i) => {
    const head = `${i.quantity}× ${i.nameBg}${
      i.variantName ? ` (${i.variantName})` : ""
    } — ${eur(i.totalPriceEur)}`;
    const extras = toOrderExtrasDisplay(i.extras, "bg").map(
      (e) => `    + ${extraKitchenLabel(e, i.quantity)}`
    );
    return [head, ...extras];
  });

  const text = [
    `Нова поръчка #${data.orderNumber}`,
    ``,
    `Клиент: ${data.customerName}`,
    `Телефон: ${data.customerPhone}`,
    `Имейл: ${data.customerEmail || "— (не е посочен)"}`,
    `Адрес: ${data.deliveryAddress}, ${data.deliveryCity}`,
    data.deliveryNote ? `Бележка: ${data.deliveryNote}` : ``,
    ``,
    `Поръчка:`,
    ...itemLines,
    ``,
    `Общо: ${eur(data.totalEur)}`,
    `Плащане: Наложен платеж`,
  ]
    .filter(Boolean)
    .join("\n");

  const itemRows = data.items
    .map((i) => {
      const extras = toOrderExtrasDisplay(i.extras, "bg");
      // Simple nested <div>s inside the same cell — no extra tables or CSS
      // that Outlook/Gmail could break.
      const extraLines = extras
        .map(
          (e) =>
            `<div style="padding-left:14px;font-size:13px;color:#555;">+ ${extraKitchenLabel(
              e,
              i.quantity
            )}</div>`
        )
        .join("");
      return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #eee;">${i.quantity}× ${i.nameBg}${
        i.variantName ? ` <span style="color:#888;">(${i.variantName})</span>` : ""
      }${extraLines}</td>
      <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;vertical-align:top;white-space:nowrap;">${eur(
        i.totalPriceEur
      )}</td>
    </tr>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <h2 style="color:#c0392b;">Нова поръчка #${data.orderNumber}</h2>
  <p style="margin:4px 0;"><strong>Клиент:</strong> ${data.customerName}</p>
  <p style="margin:4px 0;"><strong>Телефон:</strong> ${data.customerPhone}</p>
  <p style="margin:4px 0;"><strong>Имейл:</strong> ${data.customerEmail || "— (не е посочен)"}</p>
  <p style="margin:4px 0;"><strong>Адрес:</strong> ${data.deliveryAddress}, ${data.deliveryCity}</p>
  ${data.deliveryNote ? `<p style="margin:4px 0;"><strong>Бележка:</strong> ${data.deliveryNote}</p>` : ""}
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemRows}</table>
  <p style="font-size:18px;"><strong>Общо: ${eur(data.totalEur)}</strong></p>
  <p style="color:#888;">Плащане: Наложен платеж</p>
</div>`;

  return { subject, html, text };
}
