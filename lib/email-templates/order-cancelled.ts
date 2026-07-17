import type { Order } from "@/types/order";

/**
 * Placeholder template for the "order cancelled" email.
 * Real sending is wired up in Stage 6 (see docs/system-roadmap.md).
 */
export function orderCancelledEmail(order: Order): { subject: string; html: string; text: string } {
  const subject = `Вашата поръчка ${order.number} беше отказана — Pizza Pazzo`;
  const reason = order.cancellationReason ?? "По технически причини не можем да я изпълним.";

  const text = [
    `Здравейте, ${order.customer.firstName},`,
    ``,
    `За съжаление поръчка ${order.number} беше отказана.`,
    `Причина: ${reason}`,
    ``,
    `Извиняваме се за неудобството.`,
  ].join("\n");

  const html = `<p>Здравейте, ${order.customer.firstName},</p>
<p>За съжаление поръчка <strong>${order.number}</strong> беше отказана.</p>
<p>Причина: ${reason}</p>
<p>Извиняваме се за неудобството.</p>`;

  return { subject, html, text };
}
