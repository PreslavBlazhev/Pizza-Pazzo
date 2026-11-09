import type { Order } from "@/types/order";
import { buildTicket } from "@/lib/printer/ticket-template";
import { printLogoWidthMm } from "@/lib/printer/ticket-logo";
import type { PrintTemplateData } from "@/types/print";
import { TicketLines } from "@/components/admin/TicketLines";

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
 *
 * The header prints as the black-and-white logo (TicketLines), sized for the
 * paper width; the header text only appears if the image cannot load.
 */
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
      <TicketLines
        lines={lines}
        logoWidth={`${printLogoWidthMm(template.paperWidthMm, template.marginMm)}mm`}
      />
    </div>
  );
}
