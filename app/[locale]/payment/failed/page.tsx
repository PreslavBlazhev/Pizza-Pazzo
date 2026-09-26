import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, getPathname, redirect } from "@/i18n/navigation";
import { PaymentShell, PaymentHeading } from "@/components/payment/PaymentShell";
import { PaymentOrderSummary } from "@/components/payment/PaymentOrderSummary";
import { ForgetPendingPaymentLink } from "@/components/payment/PaymentSettled";
import { getCustomerPaymentView } from "@/lib/payments/customer";
import { getRestaurantSettings } from "@/lib/restaurant-settings";
import type { Locale } from "@/i18n/routing";

/**
 * /payment/failed?t=… — declined, cancelled or expired.
 *
 * The order was not sent to the kitchen and the cart is still in the
 * browser. Two ways forward: try the card again on the SAME order (no second
 * order is created), or go back to checkout and change the order or pick
 * cash. If the bank confirms the payment after all (a late confirmation),
 * this page sends the customer on to "paid" the next time it is opened.
 */
interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment.failed" });
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

const REASONS = ["FAILED", "CANCELLED", "EXPIRED", "ERROR"] as const;

export default async function PaymentFailedPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { t: token = "" } = await searchParams;

  const view = await getCustomerPaymentView(token, { refresh: true });
  if (!view) redirect({ href: "/", locale });
  const query = { t: token };
  if (view!.state === "PAID") redirect({ href: { pathname: "/payment/success", query }, locale });
  if (view!.state === "PENDING") redirect({ href: { pathname: "/payment/pending", query }, locale });
  if (view!.state === "NOT_STARTED") redirect({ href: `/checkout/pay/${token}`, locale });

  const t = await getTranslations("payment");
  const settings = await getRestaurantSettings();
  const cancelledOrder = view!.state === "ORDER_CANCELLED";
  const reason = (REASONS as readonly string[]).includes(view!.latestAttemptStatus ?? "")
    ? (view!.latestAttemptStatus as (typeof REASONS)[number])
    : "FAILED";

  return (
    <PaymentShell testNotice={view!.isTest ? t("testMode") : null}>
      <PaymentHeading
        icon="!"
        tone="error"
        title={cancelledOrder ? t("cancelled.title") : t("failed.title")}
        subtitle={cancelledOrder ? t("cancelled.subtitle") : t("failed.subtitle")}
      />
      {!cancelledOrder && (
        <p className="mt-3 text-center font-semibold text-brand-dark">{t(`failed.reason${reason}`)}</p>
      )}

      <p className="mt-4 text-center text-sm font-semibold text-pizza-muted">
        {t("orderNumber", { number: view!.order.orderNumber })}
      </p>

      {!cancelledOrder && (
        <div className="mx-auto mt-6 grid max-w-sm gap-3">
          <Link
            href={`/checkout/pay/${token}`}
            className="rounded-full bg-brand px-6 py-3.5 text-center font-semibold text-white shadow-soft transition hover:bg-brand-dark"
          >
            {t("failed.retry")}
          </Link>
          <ForgetPendingPaymentLink
            token={token}
            href={getPathname({ href: "/checkout", locale })}
            className="rounded-full border-2 border-pizza-cream-dark px-6 py-3 text-center font-semibold text-pizza-ink transition hover:border-pizza-green"
          >
            {t("failed.changeOrder")}
          </ForgetPendingPaymentLink>
        </div>
      )}

      <div className="mt-8">
        <PaymentOrderSummary order={view!.order} locale={locale} showAddress={false} />
      </div>

      <p className="mt-6 text-center text-sm text-pizza-muted">
        {t("failed.note", { phone: settings.primaryPhone })}
      </p>
    </PaymentShell>
  );
}
