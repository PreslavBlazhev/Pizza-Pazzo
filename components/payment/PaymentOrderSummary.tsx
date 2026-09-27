import { getTranslations } from "next-intl/server";
import { formatEurPrice } from "@/lib/format-price";
import { toOrderExtrasDisplay, extraLabel } from "@/lib/order-extras-display";
import type { Order } from "@/types/order";

/**
 * The order as the SERVER stored it — items, delivery and total — for the
 * payment pages. Deliberately not the browser's cart: what the customer
 * confirms here is exactly what the bank will be asked to charge.
 */
export async function PaymentOrderSummary({
  order,
  locale,
  showAddress = true,
}: {
  order: Order;
  locale: "bg" | "en";
  showAddress?: boolean;
}) {
  const t = await getTranslations("payment");
  const items = order.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-pizza-muted">
          {t("items")}
        </h2>
        <ul className="divide-y divide-pizza-cream-dark text-sm">
          {items.map((item) => {
            const name =
              locale === "en" ? (item.productNameEn ?? item.productNameBg) : item.productNameBg;
            const extras = toOrderExtrasDisplay(item.extras, locale);
            return (
              <li key={item.id} className="py-2">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 text-pizza-ink">
                    {item.quantity}× {name}
                    {item.variantName ? (
                      <span className="text-pizza-muted"> ({item.variantName})</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-medium text-pizza-ink">
                    {formatEurPrice(item.totalPriceEur)}
                  </span>
                </div>
                {extras.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5 pl-4 text-xs text-pizza-muted">
                    {extras.map((e, n) => (
                      <li key={`${item.id}-${n}`} className="break-words">
                        + {extraLabel(e)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="space-y-1.5 border-t border-pizza-cream-dark pt-3 text-sm">
        <div className="flex justify-between gap-3 text-base font-bold text-pizza-ink">
          <dt>{t("total")}</dt>
          <dd>{formatEurPrice(order.totalEur)}</dd>
        </div>
      </dl>

      {showAddress && !order.anonymizedAt && (
        <p className="text-sm text-pizza-muted">
          <span className="font-semibold text-pizza-ink">{t("deliverTo")}:</span>{" "}
          {order.deliveryAddress}, {order.deliveryCity}
        </p>
      )}
    </div>
  );
}
