import type { Order } from "@/types/order";
import { PRINT_CONFIG } from "./print-config";
import { formatBgnPrice } from "@/lib/format-price";

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
  rows.push(center(`Поръчка #${order.orderNumber}`));
  rows.push(line);

  for (const item of order.items ?? []) {
    const left = `${item.quantity}x ${item.productNameBg}`;
    const right = formatBgnPrice(item.totalPriceBgn);
    const pad = Math.max(1, width - left.length - right.length);
    rows.push(left + " ".repeat(pad) + right);
    if (item.variantName) {
      rows.push(`   + ${item.variantName}`);
    }
  }

  rows.push(line);
  const total = formatBgnPrice(order.totalBgn);
  rows.push(`ОБЩО${" ".repeat(Math.max(1, width - 4 - total.length))}${total}`);
  rows.push(line);
  rows.push(`${order.deliveryAddress}, ${order.deliveryCity}`);
  rows.push(`Тел: ${order.customerPhone}`);

  return rows.join("\n");
}
