import type { Order } from "@/types/order";
import { formatEurPrice } from "@/lib/format-price";
import { extraKitchenLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import {
  type PrintAlign,
  type PrintSectionId,
  type PrintTemplateData,
} from "@/types/print";

/**
 * Builds a ticket from an order + a print template.
 *
 * PURE and dependency-free of Next/Prisma on purpose: the same function runs
 * on the server (the print page), in the browser (the live preview in
 * /admin/settings/print) and in scripts/smoke-checkout.mjs. It never reads the
 * database — the caller passes the resolved template in.
 *
 * The output is structured, not pre-formatted text, because the two print paths
 * need different things from it:
 *
 *   - the browser renders each line as its own element with a real `pt` size,
 *     alignment and weight, and lays `right` out as a separate right-hand cell;
 *   - the thermal printer gets `toTicketText()`, which pads `right` with spaces
 *     to `charsPerLine` because a monospace receipt has no other way to align.
 *
 * Hidden sections produce no lines at all, so turning one off in the admin
 * removes it from both paths at once.
 */

/** One built line, carrying the style its section resolved to. */
export interface TicketLine {
  section: PrintSectionId;
  text: string;
  /** Right-hand value on the same row (prices). Absent on ordinary lines. */
  right?: string;
  align: PrintAlign;
  bold: boolean;
  fontPt: number;
  scale: number;
  /** True for the `-----` separators, so the renderer can stretch them. */
  divider?: boolean;
}

const DIVIDER_SECTION: PrintSectionId = "header";

/** Word wrap that hard-breaks over-long words. Never truncates. */
function wrap(text: string, width: number): string[] {
  const w = Math.max(4, width);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    let piece = word;
    while (piece.length > w) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(piece.slice(0, w));
      piece = piece.slice(w);
    }
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= w) current += ` ${piece}`;
    else {
      lines.push(current);
      current = piece;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Sofia",
  }).format(date);
}

function deliveryLabel(method: string): string {
  return method === "DELIVERY" ? "ДОСТАВКА" : "ВЗЕМАНЕ ОТ МЯСТО";
}

function paymentLabel(method: string): string {
  return method === "CASH_ON_DELIVERY" ? "В брой (наложен платеж)" : method;
}

export interface BuildTicketOptions {
  /** Marks the ticket as a repeat print (only shown if the section is on). */
  isReprint?: boolean;
}

export function buildTicket(
  order: Order,
  template: PrintTemplateData,
  options: BuildTicketOptions = {}
): TicketLine[] {
  const { sections, charsPerLine } = template;
  const lines: TicketLine[] = [];

  /** Emits one or more wrapped lines for a section, if that section is on. */
  const push = (
    section: PrintSectionId,
    text: string | null | undefined,
    extra: { right?: string; indent?: string } = {}
  ) => {
    const style = sections[section];
    if (!style?.visible || !text) return;
    const indent = extra.indent ?? "";
    // A doubled-width thermal glyph occupies two columns, so a scaled section
    // wraps at proportionally fewer characters or it runs off the paper.
    // Continuation lines repeat the same indent (no hanging indent) so that
    // `available` is exact and NO emitted line can exceed the paper width.
    const columns = Math.max(8, Math.floor(charsPerLine / style.scale));
    const available = Math.max(4, columns - indent.length);

    const emit = (body: string, right?: string) => {
      lines.push({
        section,
        text: body,
        ...(right ? { right } : {}),
        align: style.align,
        bold: style.bold,
        fontPt: style.fontPt,
        scale: style.scale,
      });
    };

    const wrapped = wrap(text, available);

    if (!extra.right) {
      wrapped.forEach((part) => emit(indent + part));
      return;
    }

    // The value belongs to the LAST label line, never the middle of a wrapped
    // name. When even that line has no room, it gets a row of its own — the
    // text renderer then pushes it to the paper edge.
    const last = wrapped[wrapped.length - 1];
    wrapped.slice(0, -1).forEach((part) => emit(indent + part));
    if (indent.length + last.length + 1 + extra.right.length <= columns) {
      emit(indent + last, extra.right);
    } else {
      emit(indent + last);
      emit("", extra.right);
    }
  };

  const divider = () => {
    if (!template.showDividers) return;
    // Never two in a row, and never one as the very first line — hiding the
    // sections between two dividers must not leave a stray rule behind.
    const last = lines[lines.length - 1];
    if (!last || last.divider) return;
    lines.push({
      section: DIVIDER_SECTION,
      text: "-".repeat(charsPerLine),
      align: "left",
      bold: false,
      fontPt: Math.min(sections.header.fontPt, 10),
      scale: 1,
      divider: true,
    });
  };

  // ── Header ──
  push("header", template.headerText);
  push("ticketType", template.name);
  push("orderNumber", `ПОРЪЧКА #${order.orderNumber}`);
  if (options.isReprint) push("reprint", "*** ПОВТОРЕН ПЕЧАТ ***");
  push("createdAt", formatTimestamp(order.createdAt));
  push("acceptedAt", (() => {
    const at = formatTimestamp(order.acceptedAt);
    return at ? `ПРИЕТА: ${at}` : null;
  })());
  if (order.estimatedTimeMinutes) {
    push("eta", `Готова за: ${order.estimatedTimeMinutes} минути`);
  }
  divider();

  // ── Customer & delivery ──
  push("customerName", order.customerName);
  push("customerPhone", `Тел: ${order.customerPhone}`);
  push("deliveryType", deliveryLabel(order.deliveryMethod));
  push("address", `${order.deliveryAddress}, ${order.deliveryCity}`);
  divider();

  // ── Items ──
  const showPrice = sections.itemPrice.visible;
  for (const item of order.items ?? []) {
    push("items", `${item.quantity} x ${item.productNameBg}`, {
      right: showPrice ? formatEurPrice(item.totalPriceEur) : undefined,
    });
    push("itemSize", item.variantName ? `Размер: ${item.variantName}` : null, { indent: "  " });
    for (const extra of toOrderExtrasDisplay(item.extras, "bg")) {
      push("itemExtras", `+ ${extraKitchenLabel(extra, item.quantity)}`, { indent: "  " });
    }
    push("itemNote", item.itemNote ? `Бележка: ${item.itemNote}` : null, { indent: "  " });
  }
  divider();

  // ── Money ──
  push("payment", `Плащане: ${paymentLabel(order.paymentMethod)}`);
  push("totals", "Междинна сума", { right: formatEurPrice(order.subtotalEur) });
  push("totals", "Доставка", { right: formatEurPrice(order.deliveryFeeEur) });
  push("grandTotal", "ОБЩО", { right: formatEurPrice(order.totalEur) });

  // ── Notes & footer ──
  if (order.deliveryNote) {
    divider();
    push("customerNote", `Бележка от клиента: ${order.deliveryNote}`);
  }
  if (template.footerText) {
    divider();
    push("footer", template.footerText);
  }

  return lines;
}

/**
 * Plain monospace render — what the thermal path prints and what the text
 * preview shows. `right` values are pushed to the paper edge with spaces, and
 * scaled sections are padded at their own (halved, thirded…) column count
 * because each glyph is that many columns wide.
 */
export function toTicketText(lines: TicketLine[], template: PrintTemplateData): string {
  const width = template.charsPerLine;

  return lines
    .map((line) => {
      const columns = Math.max(4, Math.floor(width / line.scale));
      let text = line.text;

      if (line.right) {
        const pad = Math.max(1, columns - text.length - line.right.length);
        text = text + " ".repeat(pad) + line.right;
      }

      if (line.align === "center") {
        const pad = Math.max(0, Math.floor((columns - text.length) / 2));
        return " ".repeat(pad) + text;
      }
      if (line.align === "right") {
        const pad = Math.max(0, columns - text.length);
        return " ".repeat(pad) + text;
      }
      return text;
    })
    .join("\n");
}

/** Convenience: build + render in one call. */
export function buildTicketText(
  order: Order,
  template: PrintTemplateData,
  options: BuildTicketOptions = {}
): string {
  return toTicketText(buildTicket(order, template, options), template);
}
