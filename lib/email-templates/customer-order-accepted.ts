/**
 * Customer-facing "order accepted" email. Sent to the customer when staff
 * accepts their order with an estimated time. Bulgarian — the restaurant's
 * customers order in BG and the order itself stores no locale.
 *
 * Deliberately short (owner, 2026-10-17): the brand, the number, the
 * confirmation, what was ordered (quantities, extras, combos), the total, how
 * the food arrives and how it is paid, the address (delivery only), the
 * customer's note, the estimated time, a phone number and the tracking
 * button. The merchant / terms / withdrawal block that used to follow is NOT
 * part of this e-mail any more — the legal pages themselves are unchanged and
 * stay linked from every page of the site.
 *
 * Works without images (there are none) and on a phone: one column, max
 * 560 px, inline styles only. Everything the customer typed — and, to be
 * safe, every menu name — is HTML-escaped.
 */
import { extraLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import { comboSizesLabel, summariseCombos } from "@/lib/pizza-math";
import type { OrderWithItems } from "@/types/order";

/** What the sender (lib/email/resend.ts) passes in besides the order. */
export interface AcceptedEmailContact {
  /** The restaurant's phone, from Admin → Settings. */
  phone: string;
  /** Link to the tracking page (with its token); null = no button. */
  trackingUrl?: string | null;
}

const eur = (n: number) => `${n.toFixed(2)} €`;

/** HTML escaping for text and attribute values. */
export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** "Маргарита (30 см)" or just the product name when there is no variant. */
const itemLabel = (name: string, variant: string | null) => (variant ? `${name} (${variant})` : name);

export function customerOrderAcceptedEmail(
  order: OrderWithItems,
  contact: AcceptedEmailContact
): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Поръчката ви е приета — Pizza Pazzo #${order.orderNumber}`;
  const pickup = order.deliveryMethod === "PICKUP";

  // A card order only ever reaches "accepted" after the bank confirmed it, so
  // "платено" here is a fact, not a hope (see the status workflow).
  const paidByCard = order.paymentMethod === "CARD_ONLINE" && order.paymentStatus === "PAID";
  const paymentNote = paidByCard
    ? "платено онлайн с карта"
    : pickup
      ? "в брой при получаване"
      : "в брой при доставка";
  const receiving = pickup ? "Вземане от ресторанта" : "Доставка до адрес";
  const etaLabel = pickup ? "Ориентировъчно време за получаване" : "Ориентировъчно време за доставка";
  const minutes = order.estimatedTimeMinutes ?? 30;
  const address = pickup ? null : `${order.deliveryAddress}, ${order.deliveryCity}`;
  const combos = summariseCombos(order.offer ?? []);
  const comboLine = (c: (typeof combos)[number]) =>
    `${c.count > 1 ? `${c.count} × ` : ""}Оферта за 2 пици ${comboSizesLabel(c.sizes)} — ${eur(c.comboEur)}`;

  // Extras use their BG snapshot names; "за всяка бройка" clarifies
  // multi-quantity lines.
  const perItemHint = (quantity: number) => (quantity > 1 ? " (за всяка бройка)" : "");

  // ── Plain text ──
  const textItems = order.items.flatMap((i) => {
    const head = `  ${i.quantity} × ${itemLabel(i.productNameBg, i.variantName)} — ${eur(i.totalPriceEur)}`;
    const extras = toOrderExtrasDisplay(i.extras, "bg").map(
      (e) => `      + ${extraLabel(e)}${perItemHint(i.quantity)} — ${eur(e.totalPriceEur)}`
    );
    const note = i.itemNote ? [`      Бележка: ${i.itemNote}`] : [];
    return [head, ...extras, ...note];
  });

  const text = [
    `Pizza Pazzo`,
    ``,
    `Здравейте, ${order.customerName}!`,
    ``,
    `Поръчка #${order.orderNumber} е приета и вече я приготвяме.`,
    `${etaLabel}: около ${minutes} минути.`,
    ``,
    `Вашата поръчка:`,
    ...textItems,
    ``,
    ...(combos.length > 0
      ? [...combos.map((c) => comboLine(c)), `Отстъпка „Грешна математика“: -${eur(order.discountEur)}`]
      : order.discountEur > 0
        ? [`Отстъпка „Грешна математика“: -${eur(order.discountEur)}`]
        : []),
    `Обща сума: ${eur(order.totalEur)}`,
    `Плащане: ${paymentNote}`,
    `Получаване: ${receiving}`,
    ...(address ? [`Адрес за доставка: ${address}`] : []),
    ...(order.deliveryNote ? [`Вашата бележка: ${order.deliveryNote}`] : []),
    ``,
    ...(contact.trackingUrl ? [`Проследете поръчката: ${contact.trackingUrl}`, ``] : []),
    `Въпроси? Обадете ни се: ${contact.phone}`,
    `Pizza Pazzo`,
  ].join("\n");

  // ── HTML ──
  const td = "padding:6px 8px;border-bottom:1px solid #eee;";
  const htmlRows = order.items
    .map((i) => {
      const extraLines = toOrderExtrasDisplay(i.extras, "bg")
        .map(
          (e) =>
            `<div style="padding-left:12px;font-size:13px;color:#555;">+ ${esc(extraLabel(e))}${esc(
              perItemHint(i.quantity)
            )} — ${eur(e.totalPriceEur)}</div>`
        )
        .join("");
      const note = i.itemNote
        ? `<div style="padding-left:12px;font-size:13px;color:#555;">Бележка: ${esc(i.itemNote)}</div>`
        : "";
      return `    <tr>
      <td style="${td}">${i.quantity} × ${esc(itemLabel(i.productNameBg, i.variantName))}${extraLines}${note}</td>
      <td style="${td}text-align:right;vertical-align:top;white-space:nowrap;">${eur(i.totalPriceEur)}</td>
    </tr>`;
    })
    .join("\n");

  const comboRows =
    combos.length > 0 || order.discountEur > 0
      ? `${combos
          .map(
            (c) => `    <tr>
      <td colspan="2" style="padding:4px 8px;font-size:13px;color:#555;">${esc(comboLine(c))}</td>
    </tr>`
          )
          .join("\n")}
    <tr>
      <td style="padding:6px 8px;color:#178A3D;">Отстъпка „Грешна математика“</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap;color:#178A3D;">-${eur(order.discountEur)}</td>
    </tr>
`
      : "";

  const button = contact.trackingUrl
    ? `  <p style="margin:20px 0;text-align:center;">
    <a href="${esc(contact.trackingUrl)}" style="display:inline-block;background:#178A3D;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;font-size:16px;">Проследи поръчката</a>
  </p>
`
    : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#222;font-size:15px;line-height:1.45;">
  <p style="margin:0 0 12px;font-size:20px;font-weight:bold;color:#C62828;letter-spacing:1px;">PIZZA PAZZO</p>
  <h1 style="margin:0 0 8px;font-size:22px;color:#178A3D;">Поръчка #${order.orderNumber} е приета</h1>
  <p style="margin:0 0 8px;">Здравейте, ${esc(order.customerName)}! Вече приготвяме поръчката ви.</p>
  <p style="margin:0 0 12px;font-size:16px;"><strong>${etaLabel}:</strong> около ${minutes} минути</p>
${button}  <table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0;">
${htmlRows}
${comboRows}    <tr>
      <td style="padding:8px;font-weight:bold;border-top:2px solid #222;">Обща сума</td>
      <td style="padding:8px;font-weight:bold;border-top:2px solid #222;text-align:right;white-space:nowrap;">${eur(order.totalEur)}</td>
    </tr>
  </table>
  <p style="margin:4px 0;"><strong>Плащане:</strong> ${paymentNote}</p>
  <p style="margin:4px 0;"><strong>Получаване:</strong> ${receiving}</p>
${address ? `  <p style="margin:4px 0;"><strong>Адрес за доставка:</strong> ${esc(address)}</p>\n` : ""}${
    order.deliveryNote ? `  <p style="margin:4px 0;"><strong>Вашата бележка:</strong> ${esc(order.deliveryNote)}</p>\n` : ""
  }  <p style="margin:16px 0 4px;">Въпроси? Обадете ни се: <a href="tel:${esc(contact.phone.replace(/[^\d+]/g, ""))}" style="color:#178A3D;">${esc(contact.phone)}</a></p>
  <p style="margin:12px 0 0;color:#888;font-size:13px;">Pizza Pazzo</p>
</div>`;

  return { subject, html, text };
}
