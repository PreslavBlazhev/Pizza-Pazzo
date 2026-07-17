import type { Order } from "@/types/order";
import { PRINT_CONFIG } from "./print-config";
import { formatEur } from "@/lib/format-price";

/**
 * Builds a plain-text 80mm ticket representation of an order.
 * Used by the print page and (later) any direct-print integration.
 */
export function buildTicketText(order: Order): string {
  const width = PRINT_CONFIG.charsPerLine;
  const line = "-".repeat(width);
  const center = (s: string) =>
    s.length >= width ? s : " ".repeat(Math.floor((width - s.length) / 2)) + s;

  const rows: string[] = [];
  rows.push(center("PIZZA PAZZO"));
  rows.push(center(`Order ${order.number}`));
  rows.push(line);

  for (const item of order.items) {
    const left = `${item.quantity}x ${item.product.name}`;
    const right = formatEur(item.unitPrice * item.quantity);
    const pad = Math.max(1, width - left.length - right.length);
    rows.push(left + " ".repeat(pad) + right);
    if (item.selectedVariant) {
      rows.push(`   + ${item.selectedVariant.name}`);
    }
  }

  rows.push(line);
  const total = formatEur(order.totals.total);
  rows.push(`TOTAL${" ".repeat(Math.max(1, width - 5 - total.length))}${total}`);
  rows.push(line);
  if (order.type === "delivery" && order.address) {
    rows.push(`${order.address.street} ${order.address.number}`);
  }
  rows.push(`Tel: ${order.customer.phone}`);

  return rows.join("\n");
}
