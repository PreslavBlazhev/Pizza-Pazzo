/**
 * Customer-facing "order accepted" email. Sent to the customer when staff
 * accepts their order with an estimated delivery time. Bulgarian — the
 * restaurant's customers order in BG and the order itself stores no locale.
 */
import { extraLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import type { OrderWithItems } from "@/types/order";

/**
 * The contact details printed in the signature. Passed in by the sender
 * (lib/email/resend.ts), which reads them from the admin-editable settings —
 * the template stays a pure function with no database or constants access, so
 * an edited phone number reaches the next email without a deploy.
 */
export interface AcceptedEmailContact {
  phone: string;
  /** Public contact e-mail (Admin → Settings) — for complaints and withdrawal. */
  email?: string;
  /** The site's public origin, e.g. "https://pizzapazzo.bg" — for the document links. */
  siteUrl?: string;
  /**
   * The seller as registered (content/legal/company.ts). With it the e-mail
   * is the confirmation of the contract on a durable medium: who sold, what,
   * for how much, and under which terms (Art. 49 of the Consumer Protection Act).
   */
  merchant?: {
    legalName: string;
    uic: string;
    vatNumber: string;
    registeredAddress: string;
  };
}

const eur = (n: number) => `${n.toFixed(2)} €`;

/** Minimal HTML escaping for customer-supplied strings. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "Маргарита (30 см)" or just the product name when there is no variant. */
const itemLabel = (name: string, variant: string | null) =>
  variant ? `${name} (${variant})` : name;

/** The contract-information block of the HTML e-mail. */
function contractHtml(
  contact: AcceptedEmailContact,
  doc: (path: string) => string,
  versionNote: (version: string | null | undefined) => string,
  v: OrderWithItems["consent"] | undefined
): string {
  const m = contact.merchant!;
  const link = (path: string, label: string, version: string | null | undefined) =>
    `<a href="${esc(doc(path))}" style="color:#178A3D;">${label}</a>${esc(versionNote(version))}`;
  return `  <div style="margin-top:18px;padding:12px;border:1px solid #eee;border-radius:8px;font-size:13px;color:#444;">
    <p style="margin:0 0 6px;"><strong>Търговец:</strong> ${esc(m.legalName)}, ЕИК ${esc(m.uic)}, ДДС № ${esc(m.vatNumber)}<br/>
    Седалище и адрес за кореспонденция: ${esc(m.registeredAddress)}<br/>
    Телефон: ${esc(contact.phone)}${contact.email ? ` · Имейл: ${esc(contact.email)}` : ""}</p>
    <p style="margin:6px 0;"><strong>Приети условия:</strong> ${link("/terms", "Общи условия", v?.termsVersion)} · ${link("/refunds", "Отказ, връщане и рекламации", v?.refundsVersion)} · ${link("/privacy", "Политика за поверителност", v?.privacyVersion)}</p>
    <p style="margin:6px 0;"><strong>Право на отказ:</strong> не се прилага за приготвената по поръчка храна (чл. 57, т. 3 и 4 ЗЗП); за неотворени бутилирани напитки — 14 дни от получаването, вижте условията. Отказ от поръчката е възможен безплатно, докато не е започнало приготвянето — обадете ни се.</p>
    <p style="margin:6px 0 0;"><strong>Рекламации:</strong> на телефона или имейла по-горе, с номера на поръчката.</p>
  </div>
`;
}

export function customerOrderAcceptedEmail(
  order: OrderWithItems,
  contact: AcceptedEmailContact
): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Поръчката ви е приета — Pizza Pazzo #${order.orderNumber}`;

  // A card order only ever reaches "accepted" after the bank confirmed it, so
  // "платено" here is a fact, not a hope (see updateOrderStatusAction).
  const paidByCard = order.paymentMethod === "CARD_ONLINE" && order.paymentStatus === "PAID";
  const paymentNote = paidByCard ? "платено онлайн с карта" : "в брой при доставка";

  // The customer email is Bulgarian (the order stores no locale), so extras use
  // their BG snapshot names; "за всяка бройка" clarifies multi-quantity lines.
  const perItemHint = (quantity: number) =>
    quantity > 1 ? " (за всяка бройка)" : "";

  // ── The contract information: seller, terms accepted, withdrawal, complaints.
  const base = (contact.siteUrl ?? "").replace(/\/+$/, "");
  const doc = (path: string) => (base ? `${base}${path}` : path);
  const v = order.consent;
  const versionNote = (version: string | null | undefined) => (version ? ` (версия ${version})` : "");
  const contractLines: string[] = contact.merchant
    ? [
        `Търговец: ${contact.merchant.legalName}, ЕИК ${contact.merchant.uic}, ДДС № ${contact.merchant.vatNumber}`,
        `Седалище и адрес за кореспонденция: ${contact.merchant.registeredAddress}`,
        `Телефон: ${contact.phone}${contact.email ? ` · Имейл: ${contact.email}` : ""}`,
        ``,
        `Приложими условия, приети при поръчката:`,
        `  Общи условия${versionNote(v?.termsVersion)}: ${doc("/terms")}`,
        `  Отказ, връщане и рекламации${versionNote(v?.refundsVersion)}: ${doc("/refunds")}`,
        `  Политика за поверителност${versionNote(v?.privacyVersion)}: ${doc("/privacy")}`,
        ``,
        `Право на отказ: не се прилага за приготвената по поръчка храна (чл. 57, т. 3 и 4 ЗЗП); за неотворени бутилирани напитки — 14 дни от получаването, вижте условията.`,
        `Отказ от поръчката е възможен безплатно, докато не е започнало приготвянето — обадете ни се.`,
        `Рекламации: на телефона или имейла по-горе, с номера на поръчката.`,
      ]
    : [];

  const textItems = order.items.flatMap((i) => {
    const head =
      `  ${i.quantity} × ${itemLabel(i.productNameBg, i.variantName)} — ` +
      `${eur(i.totalPriceEur)}`;
    const extras = toOrderExtrasDisplay(i.extras, "bg").map(
      (e) =>
        `      + ${extraLabel(e)}${perItemHint(i.quantity)} — ` +
        `${eur(e.totalPriceEur)}`
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
    `Обща сума: ${eur(order.totalEur)} (${paymentNote})`,
    ``,
    `Адрес за доставка: ${order.deliveryAddress}, ${order.deliveryCity}`,
    ...(order.deliveryNote ? [`Бележка: ${order.deliveryNote}`] : []),
    ``,
    `Ще се свържем с вас при нужда.`,
    ``,
    ...(contractLines.length > 0 ? [...contractLines, ``] : []),
    `Pizza Pazzo · ${contact.phone}`,
  ].join("\n");

  const htmlRows = order.items
    .map((i) => {
      const extraLines = toOrderExtrasDisplay(i.extras, "bg")
        .map(
          (e) =>
            `<div style="padding-left:14px;font-size:13px;color:#555;">+ ${esc(
              extraLabel(e)
            )}${esc(perItemHint(i.quantity))} — ${eur(e.totalPriceEur)}</div>`
        )
        .join("");
      return `    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.quantity} × ${esc(
        itemLabel(i.productNameBg, i.variantName)
      )}${extraLines}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;vertical-align:top;white-space:nowrap;">${eur(
        i.totalPriceEur
      )}</td>
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
      <td style="padding:6px 8px;font-weight:bold;border-top:2px solid #222;">Обща сума (${paymentNote})</td>
      <td style="padding:6px 8px;font-weight:bold;border-top:2px solid #222;text-align:right;white-space:nowrap;">${eur(order.totalEur)}</td>
    </tr>
  </table>
  <p style="margin:4px 0;"><strong>Адрес за доставка:</strong> ${esc(order.deliveryAddress)}, ${esc(order.deliveryCity)}</p>
${order.deliveryNote ? `  <p style="margin:4px 0;"><strong>Бележка:</strong> ${esc(order.deliveryNote)}</p>\n` : ""}  <p>Ще се свържем с вас при нужда.</p>
${contact.merchant ? contractHtml(contact, doc, versionNote, v) : ""}  <p style="color:#888;">Pizza Pazzo · тел. ${contact.phone}</p>
</div>`;

  return { subject, html, text };
}
