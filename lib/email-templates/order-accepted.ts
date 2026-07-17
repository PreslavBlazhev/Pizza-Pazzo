import type { Order } from "@/types/order";

/**
 * Placeholder template for the "order accepted" email.
 * Real sending is wired up in Stage 6 (see docs/system-roadmap.md).
 */
export function orderAcceptedEmail(order: Order): { subject: string; html: string; text: string } {
  const subject = `Вашата поръчка ${order.number} е приета — Pizza Pazzo`;
  const eta = order.etaMinutes ? `около ${order.etaMinutes} минути` : "скоро";

  const text = [
    `Здравейте, ${order.customer.firstName}!`,
    ``,
    `Вашата поръчка ${order.number} беше приета.`,
    `Очаквано време: ${eta}.`,
    ``,
    `Благодарим Ви, че избрахте Pizza Pazzo!`,
  ].join("\n");

  const html = `<p>Здравейте, ${order.customer.firstName}!</p>
<p>Вашата поръчка <strong>${order.number}</strong> беше приета.</p>
<p>Очаквано време: <strong>${eta}</strong>.</p>
<p>Благодарим Ви, че избрахте Pizza Pazzo!</p>`;

  return { subject, html, text };
}
