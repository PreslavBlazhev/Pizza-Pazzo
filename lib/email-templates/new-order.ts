/**
 * Restaurant-facing "new order" notification. Sent to the order inbox
 * (ORDER_NOTIFICATION_EMAIL) whenever a customer places an order. Bulgarian —
 * this is read by staff.
 */

import type { OrderItemExtra } from "@/lib/extras-rules";
import { extraKitchenLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import {
  adjustmentLabelBg,
  comboLineBg,
  offerAdjustment,
  signedAdjustment,
  type ComboLike,
} from "@/lib/offer-display";
import { esc } from "@/lib/email-templates/escape";

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
  /**
   * regular − package price of the combos, already in totalEur; 0 = none.
   * Negative when the package prices are above the regular prices — shown
   * as "Разлика до пакетната цена +X €" (lib/offer-display.ts).
   */
  discountEur?: number;
  /** The combos, with package and regular price (Order.offerJson). */
  offer?: ComboLike[];
  items: NewOrderEmailItem[];
  /**
   * How the money is handled, e.g. "ПЛАТЕНО ОНЛАЙН С КАРТА — НЕ СЪБИРАЙ ПАРИ"
   * (see collectInstructionBg in lib/payments/status.ts). Optional so a
   * caller that predates card payments still reads as cash on delivery.
   */
  paymentLine?: string;
  /** Simulator / sandbox order: flagged in the subject, never real food. */
  isTest?: boolean;
}

const eur = (n: number) => `${n.toFixed(2)} €`;

export function newOrderEmail(data: NewOrderEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const testPrefix = data.isTest ? "[ТЕСТ — НЕ ПРИГОТВЯЙ] " : "";
  const adj = offerAdjustment(data.discountEur ?? 0);
  const adjLabel = adjustmentLabelBg(adj.kind);
  const offerLines = [
    ...(data.offer ?? []).map((c) => comboLineBg(c, eur)),
    ...(adjLabel ? [`${adjLabel}: ${signedAdjustment(adj, eur, "-")}`] : []),
  ];
  const subject = `${testPrefix}Нова поръчка #${data.orderNumber} — Pizza Pazzo`;
  const paymentLine = data.paymentLine ?? "В брой при доставка (наложен платеж)";

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
    ...offerLines,
    `Общо: ${eur(data.totalEur)}`,
    `Плащане: ${paymentLine}`,
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
            `<div style="padding-left:14px;font-size:13px;color:#555;">+ ${esc(
              extraKitchenLabel(e, i.quantity)
            )}</div>`
        )
        .join("");
      return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #eee;">${i.quantity}× ${esc(i.nameBg)}${
        i.variantName ? ` <span style="color:#888;">(${esc(i.variantName)})</span>` : ""
      }${extraLines}</td>
      <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;vertical-align:top;white-space:nowrap;">${eur(
        i.totalPriceEur
      )}</td>
    </tr>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <h2 style="color:#c0392b;">${testPrefix}Нова поръчка #${data.orderNumber}</h2>
  <p style="margin:4px 0;"><strong>Клиент:</strong> ${esc(data.customerName)}</p>
  <p style="margin:4px 0;"><strong>Телефон:</strong> ${esc(data.customerPhone)}</p>
  <p style="margin:4px 0;"><strong>Имейл:</strong> ${esc(data.customerEmail || "— (не е посочен)")}</p>
  <p style="margin:4px 0;"><strong>Адрес:</strong> ${esc(data.deliveryAddress)}, ${esc(data.deliveryCity)}</p>
  ${data.deliveryNote ? `<p style="margin:4px 0;"><strong>Бележка:</strong> ${esc(data.deliveryNote)}</p>` : ""}
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemRows}</table>
  ${offerLines.map((l) => `<p style="margin:4px 0;">${esc(l)}</p>`).join("\n  ")}
  <p style="font-size:18px;"><strong>Общо: ${eur(data.totalEur)}</strong></p>
  <p style="font-weight:bold;">Плащане: ${paymentLine}</p>
</div>`;

  return { subject, html, text };
}
