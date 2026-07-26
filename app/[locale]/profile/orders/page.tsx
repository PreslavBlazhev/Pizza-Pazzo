import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { requireUser } from "@/lib/auth";
import { getOrdersForUser } from "@/lib/orders";
import { formatBgnPrice, formatEurPrice } from "@/lib/format-price";
import { extraLabel, toOrderExtrasDisplay } from "@/lib/order-extras-display";
import { formatDateTime } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("orders"), robots: { index: false, follow: false } };
}

// Session-dependent: must never be prerendered. See app/[locale]/admin/layout.tsx.
export const dynamic = "force-dynamic";

export default async function ProfileOrdersPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("profile");
  const tNav = await getTranslations("nav");
  const tCommon = await getTranslations("common");

  const user = await requireUser("/profile/orders");
  // Only the user's own orders; guest orders carry no userId and never show here.
  const orders = await getOrdersForUser(user.id);

  const dateLocale = locale === "en" ? "en-GB" : "bg-BG";

  return (
    <>
      <Header />
      <main className="container max-w-3xl py-12 sm:py-16">
        <div className="flex items-center gap-3 text-sm text-pizza-muted">
          <Link href="/profile" className="transition hover:text-brand">
            {tNav("profile")}
          </Link>
          <span aria-hidden>›</span>
          <span className="text-pizza-ink">{t("orders")}</span>
        </div>

        <h1 className="mt-3 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("orders")}
        </h1>

        {orders.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-pizza-cream-dark bg-white px-6 py-14 text-center shadow-card">
            <p className="text-4xl" aria-hidden>
              🧾
            </p>
            <p className="mt-4 font-display text-xl font-semibold text-pizza-ink">
              {t("ordersEmpty")}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-pizza-muted">
              {t("ordersEmptyHint")}
            </p>
            <Link
              href="/menu"
              className="mt-7 inline-block rounded-full bg-brand px-8 py-3 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              {tCommon("browseMenu")}
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {orders.map((order) => {
              const items = order.items ?? [];
              const itemsCount = items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <article
                  key={order.id}
                  className="rounded-3xl border border-pizza-cream-dark bg-white p-5 shadow-card sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-lg font-semibold text-pizza-ink">
                        {t("orderTitle", { number: order.orderNumber })}
                      </h2>
                      <OrderStatusBadge status={order.status} locale={locale} />
                    </div>
                    <p className="text-sm text-pizza-muted">
                      {formatDateTime(order.createdAt, dateLocale)}
                    </p>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-sm text-pizza-ink">
                    {items.map((item) => {
                      const name =
                        locale === "en"
                          ? item.productNameEn ?? item.productNameBg
                          : item.productNameBg;
                      // From the order's own snapshot — the menu may have
                      // changed since, the order must not.
                      const extras = toOrderExtrasDisplay(item.extras, locale);
                      return (
                        <li key={item.id}>
                          {item.quantity}× {name}
                          {item.variantName ? ` (${item.variantName})` : ""}
                          {extras.length > 0 && (
                            <ul className="mt-0.5 space-y-0.5 pl-4 text-xs text-pizza-muted">
                              {extras.map((e, n) => (
                                <li key={`${item.id}-x${n}`} className="break-words">
                                  + {extraLabel(e)}
                                  {item.quantity > 1 ? ` (${t("orderPerItem")})` : ""}
                                  {" — "}
                                  <span className="whitespace-nowrap">
                                    {formatEurPrice(e.totalPriceEur)} /{" "}
                                    {formatBgnPrice(e.totalPriceBgn)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-pizza-cream-dark pt-3 text-sm">
                    <p className="text-pizza-muted">
                      {t("orderAddress")}: {order.deliveryAddress}, {order.deliveryCity}
                      {" · "}
                      {t("orderItemsCount", { count: itemsCount })}
                    </p>
                    <p className="whitespace-nowrap">
                      <span className="font-semibold text-brand">
                        {formatEurPrice(order.totalEur)}
                      </span>{" "}
                      <span className="text-xs text-pizza-muted">
                        / {formatBgnPrice(order.totalBgn)}
                      </span>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
