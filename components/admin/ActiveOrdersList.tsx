"use client";

import { Link } from "@/i18n/navigation";
import { nextStepLabelBg, statusFlowFor, statusLabelBg } from "@/lib/order-status";
import { emailJobLabelBg, type EmailJobView } from "@/lib/email/outbox-status";
import { PrintOrderButtons } from "./PrintOrderButton";
import type { OrderWithItems } from "@/types/order";
import type { PrintTemplateData } from "@/types/print";

/**
 * "В процес" — the orders the kitchen accepted, with ONE big button for the
 * next step and the print buttons. What the customer's tracking page shows
 * is exactly what is pressed here; nothing advances by itself.
 *
 * The order's status and its e-mail are two separate lines on purpose: an
 * order can be "Приготвя се" while its e-mail failed, and staff need to see
 * both. Every tap carries the status this screen shows, so a second tablet
 * that already moved the order turns the tap into a clear conflict message
 * (lib/order-workflow.ts) instead of a double step.
 */
export function ActiveOrdersList({
  orders,
  emailJobs,
  printTemplates,
  busyOrderId,
  statusError,
  onSubmit,
}: {
  orders: OrderWithItems[];
  emailJobs: Record<string, EmailJobView>;
  printTemplates: PrintTemplateData[];
  busyOrderId: string | null;
  statusError: { orderId: string; message: string } | null;
  onSubmit: (orderId: string, fields: Record<string, string>) => Promise<void>;
}) {
  if (orders.length === 0) return null;

  return (
    <div className="mt-8" data-testid="active-orders">
      <h2 className="mb-3 text-lg font-bold text-neutral-700">В процес</h2>
      <div className="space-y-3">
        {orders.map((order) => {
          const method = order.deliveryMethod;
          const next = statusFlowFor(method)[order.status].filter((s) => s !== "CANCELLED");
          const job = emailJobs[order.id];
          const emailLine = emailJobLabelBg(job, !!order.customerEmail);
          const emailBad = job?.status === "FAILED" || job?.status === "NEEDS_REVIEW";
          const busy = busyOrderId === order.id;
          return (
            <div
              key={order.id}
              className="rounded-2xl border-2 border-pizza-green/40 bg-white p-4"
              data-testid={`active-order-${order.orderNumber}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-extrabold text-pizza-ink">
                    #{order.orderNumber}
                    <span className="ml-2 rounded-full bg-pizza-green/10 px-2.5 py-0.5 text-sm font-bold text-pizza-green-dark">
                      {statusLabelBg(order.status, method)}
                    </span>
                    <span className="ml-2 text-sm font-semibold text-neutral-500">
                      {method === "PICKUP" ? "от място" : "доставка"}
                      {order.estimatedTimeMinutes ? ` · ${order.estimatedTimeMinutes} мин` : ""}
                    </span>
                  </p>
                  <p className="truncate text-sm text-neutral-500">
                    {order.customerName}
                    {method === "PICKUP" ? "" : ` · ${order.deliveryAddress}`}
                  </p>
                  <p
                    className={`mt-1 text-xs font-semibold ${emailBad ? "text-red-600" : "text-neutral-500"}`}
                    data-testid="email-status"
                  >
                    {emailLine}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {next.map((to) => (
                    <button
                      key={to}
                      type="button"
                      disabled={busy}
                      onClick={() => void onSubmit(order.id, { status: to, fromStatus: order.status })}
                      className="min-h-12 rounded-2xl bg-pizza-green px-5 py-3 text-base font-extrabold text-white shadow-md transition hover:bg-pizza-green-dark disabled:opacity-60"
                      data-testid={`step-${to}`}
                    >
                      {busy ? "…" : nextStepLabelBg(to, method)}
                    </button>
                  ))}
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    Детайли
                  </Link>
                </div>
              </div>
              {statusError?.orderId === order.id && (
                <p className="mt-2 text-sm font-semibold text-red-600" role="alert">
                  {statusError.message}
                </p>
              )}
              <div className="mt-3">
                <PrintOrderButtons order={order} templates={printTemplates} compact />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
