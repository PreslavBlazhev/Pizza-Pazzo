import type { Order } from "@/types/order";
import { buildTicket, type TicketLine } from "@/lib/printer/ticket-template";
import type { PrintTemplateData } from "@/types/print";

/**
 * Renders a ticket for the BROWSER print path, honouring the template's real
 * point sizes, alignment and weight.
 *
 * Each line is its own element rather than one `<pre>` block, because sections
 * now carry independent font sizes — a single preformatted block can only have
 * one. The paper width and margins come from the template and are applied
 * inline, so the print dialog is handed an element that is already the right
 * physical size; `@media print` in globals.css only strips the surrounding
 * chrome.
 *
 * `right` values (prices) are laid out as a flex row instead of space padding:
 * with mixed font sizes, monospace column counting no longer lines up.
 */

const ALIGN_CLASS = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
} as const;

function TicketRow({ line }: { line: TicketLine }) {
  if (line.divider) {
    return <div aria-hidden className="my-1 border-t border-dashed border-black" />;
  }

  return (
    <div
      className={`flex gap-2 ${ALIGN_CLASS[line.align]}`}
      style={{
        fontSize: `${line.fontPt}pt`,
        fontWeight: line.bold ? 700 : 400,
      }}
    >
      <span className="whitespace-pre-wrap break-words">{line.text}</span>
      {line.right && <span className="ml-auto whitespace-nowrap">{line.right}</span>}
    </div>
  );
}

export function PrintTicket({
  order,
  template,
  isReprint = false,
}: {
  order: Order;
  template: PrintTemplateData;
  isReprint?: boolean;
}) {
  const lines = buildTicket(order, template, { isReprint });

  return (
    <div
      className="print-ticket bg-white font-mono text-black"
      style={{
        width: `${template.paperWidthMm}mm`,
        padding: `${template.marginMm}mm`,
        lineHeight: template.lineHeight,
      }}
    >
      {lines.map((line, index) => (
        <TicketRow key={`${line.section}-${index}`} line={line} />
      ))}
    </div>
  );
}
