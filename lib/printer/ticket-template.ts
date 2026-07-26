import type { Order } from "@/types/order";
import { PRINT_CONFIG } from "./print-config";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { extraKitchenLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";

/**
 * Builds a plain-text 80mm ticket representation of an order.
 * Used by the print page and (later) any direct-print integration.
 *
 * Kitchen-first: each dish is followed by its size and its chosen extras, with
 * "/ всяка" on multi-quantity lines so the extras read as per-pizza. Extras
 * carry no prices — only the line total does, keeping the lines short and the
 * ticket unambiguous for the kitchen.
 */
export function buildTicketText(order: Order): string {
  const width = PRINT_CONFIG.charsPerLine;
  const line = "-".repeat(width);
  const center = (s: string) =>
    s.length >= width ? s : " ".repeat(Math.floor((width - s.length) / 2)) + s;

  /**
   * Wraps `text` to the paper width, indenting every line (continuation lines
   * get two extra spaces). Never truncates — a long topping name must stay
   * readable. Words longer than one line are hard-broken.
   */
  const wrapIndented = (text: string, indent: string): string[] => {
    const avail = Math.max(8, width - indent.length);
    const out: string[] = [];
    let current = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      let piece = word;
      while (piece.length > avail) {
        if (current) {
          out.push(current);
          current = "";
        }
        out.push(piece.slice(0, avail));
        piece = piece.slice(avail);
      }
      if (!current) current = piece;
      else if (current.length + 1 + piece.length <= avail) current += ` ${piece}`;
      else {
        out.push(current);
        current = piece;
      }
    }
    if (current) out.push(current);
    return out.map((l, i) => (i === 0 ? indent : `${indent}  `) + l);
  };

  const rows: string[] = [];
  rows.push(center("PIZZA PAZZO"));
  rows.push(center(`Поръчка #${order.orderNumber}`));
  rows.push(line);

  for (const item of order.items ?? []) {
    const left = `${item.quantity}x ${item.productNameBg}`;
    const right = formatEurPrice(item.totalPriceEur);
    const pad = Math.max(1, width - left.length - right.length);
    rows.push(left + " ".repeat(pad) + right);
    if (item.variantName) {
      rows.push(...wrapIndented(`Размер: ${item.variantName}`, "   "));
    }
    for (const extra of toOrderExtrasDisplay(item.extras, "bg")) {
      rows.push(...wrapIndented(`+ ${extraKitchenLabel(extra, item.quantity)}`, "   "));
    }
  }

  rows.push(line);
  // EUR is the primary currency; the BGN equivalent prints right-aligned below.
  const totalEur = formatEurPrice(order.totalEur);
  const totalBgn = formatBgnPrice(order.totalBgn);
  rows.push(`ОБЩО${" ".repeat(Math.max(1, width - 4 - totalEur.length))}${totalEur}`);
  rows.push(" ".repeat(Math.max(0, width - totalBgn.length)) + totalBgn);
  rows.push(line);
  rows.push(`${order.deliveryAddress}, ${order.deliveryCity}`);
  rows.push(`Тел: ${order.customerPhone}`);

  return rows.join("\n");
}
