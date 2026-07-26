/**
 * Customer-facing "order accepted" email. Sent to the customer when staff
 * accepts their order with an estimated delivery time. Bulgarian — the
 * restaurant's customers order in BG and the order itself stores no locale.
 */
import { SITE } from "@/lib/constants";
import { extraLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import type { OrderWithItems } from "@/types/order";

const bgn = (n: number) => `${n.toFixed(2)} лв.`;
const eur = (n: number) => `${n.toFixed(2)} €`;

/** Minimal HTML escaping for customer-supplied strings. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "Маргарита (30 см)" or just the product name when there is no variant. */
const itemLabel = (name: string, variant: string | null) =>
  variant ? `${name} (${variant})` : name;

export function customerOrderAcceptedEmail(order: OrderWithItems): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Поръчката ви е приета — Pizza Pazzo #${order.orderNumber}`;

  // The customer email is Bulgarian (the order stores no locale), so extras use
  // their BG snapshot names; "за всяка бройка" clarifies multi-quantity lines.
  const perItemHint = (quantity: number) =>
    quantity > 1 ? " (за всяка бройка)" : "";

  const textItems = order.items.flatMap((i) => {
    const head =
      `  ${i.quantity} × ${itemLabel(i.productNameBg, i.variantName)} — ` +
      `${eur(i.totalPriceEur)} / ${bgn(i.totalPriceBgn)}`;
    const extras = toOrderExtrasDisplay(i.extras, "bg").map(
      (e) =>
        `      + ${extraLabel(e)}${perItemHint(i.quantity)} — ` +
        `${eur(e.totalPriceEur)} / ${bgn(e.totalPriceBgn)}`
    );
    return [head, ...extras];
  });

  const text = [
    `Здравейте, ${order.customerName}!`,
    ``,
    `Благодарим ви за поръчката! Поръчка #${order.orderNumber} е приета.`,
    ``,
    `Ориентировъчно време за доставка: около ${order.estimatedTimeMinutes ?? 30} минути.`,
    ``,
    `Вашата поръчка:`,
    ...textItems,
    ``,
    `Междинна сума: ${eur(order.subtotalEur)} / ${bgn(order.subtotalBgn)}`,
    `Доставка: ${eur(order.deliveryFeeEur)} / ${bgn(order.deliveryFeeBgn)}`,
    `Обща сума: ${eur(order.totalEur)} / ${bgn(order.totalBgn)} (наложен платеж)`,
    ``,
    `Адрес за доставка: ${order.deliveryAddress}, ${order.deliveryCity}`,
    ...(order.deliveryNote ? [`Бележка: ${order.deliveryNote}`] : []),
    ``,
    `Ще се свържем с вас при нужда.`,
    ``,
    `Pizza Pazzo · ${SITE.phone}`,
  ].join("\n");

  const htmlRows = order.items
    .map((i) => {
      const extraLines = toOrderExtrasDisplay(i.extras, "bg")
        .map(
          (e) =>
            `<div style="padding-left:14px;font-size:13px;color:#555;">+ ${esc(
              extraLabel(e)
            )}${esc(perItemHint(i.quantity))} — ${eur(e.totalPriceEur)} / ${bgn(
              e.totalPriceBgn
            )}</div>`
        )
        .join("");
      return `    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.quantity} × ${esc(
        itemLabel(i.productNameBg, i.variantName)
      )}${extraLines}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;vertical-align:top;white-space:nowrap;">${eur(
        i.totalPriceEur
      )} <span style="color:#888;">/ ${bgn(i.totalPriceBgn)}</span></td>
    </tr>`;
    })
    .join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <h2 style="color:#27ae60;">Поръчка #${order.orderNumber} е приета ✔</h2>
  <p>Здравейте, ${esc(order.customerName)}!</p>
  <p>Благодарим ви за поръчката! Приготвяме я.</p>
  <p style="margin:4px 0;font-size:16px;"><strong>Ориентировъчно време за доставка:</strong> около ${
    order.estimatedTimeMinutes ?? 30
  } минути</p>
  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
${htmlRows}
    <tr>
      <td style="padding:6px 8px;color:#555;">Междинна сума</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${eur(order.subtotalEur)} <span style="color:#888;">/ ${bgn(order.subtotalBgn)}</span></td>
    </tr>
    <tr>
      <td style="padding:6px 8px;color:#555;">Доставка</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${eur(order.deliveryFeeEur)} <span style="color:#888;">/ ${bgn(order.deliveryFeeBgn)}</span></td>
    </tr>
    <tr>
      <td style="padding:6px 8px;font-weight:bold;border-top:2px solid #222;">Обща сума (наложен платеж)</td>
      <td style="padding:6px 8px;font-weight:bold;border-top:2px solid #222;text-align:right;white-space:nowrap;">${eur(order.totalEur)} <span style="color:#888;">/ ${bgn(order.totalBgn)}</span></td>
    </tr>
  </table>
  <p style="margin:4px 0;"><strong>Адрес за доставка:</strong> ${esc(order.deliveryAddress)}, ${esc(order.deliveryCity)}</p>
${order.deliveryNote ? `  <p style="margin:4px 0;"><strong>Бележка:</strong> ${esc(order.deliveryNote)}</p>\n` : ""}  <p>Ще се свържем с вас при нужда.</p>
  <p style="color:#888;">Pizza Pazzo · тел. ${SITE.phone}</p>
</div>`;

  return { subject, html, text };
}
