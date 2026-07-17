import type { Order } from "@/types/order";
import { buildTicketText } from "@/lib/printer/ticket-template";

/**
 * Renders the order as an 80mm thermal ticket. The parent print page triggers
 * window.print(); the `.print-ticket` class in globals.css sizes it to 80mm.
 * See docs/printing-plan.md.
 */
export function PrintTicket({ order }: { order: Order }) {
  return (
    <pre className="print-ticket whitespace-pre-wrap font-mono text-xs leading-tight text-black">
      {buildTicketText(order)}
    </pre>
  );
}
