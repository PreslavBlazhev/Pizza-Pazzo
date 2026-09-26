import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { PaymentShell, PaymentHeading } from "@/components/payment/PaymentShell";
import { PaymentStatusPoller } from "@/components/payment/PaymentStatusPoller";
import { PayWithCardForm } from "@/components/payment/PayWithCardForm";
import { getCustomerPaymentView } from "@/lib/payments/customer";
import { getRestaurantSettings } from "@/lib/restaurant-settings";
import type { Locale } from "@/i18n/routing";

/**
 * /payment/pending?t=… — the provider has not given a final answer yet
 * (3-D Secure still running, a slow bank, a timeout on our side). The page
 * keeps asking and moves on by itself; the order stays away from the kitchen
 * until the payment is confirmed.
 */
interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment.pending" });
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

export default async function PaymentPendingPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { t: token = "" } = await searchParams;

  const view = await getCustomerPaymentView(token, { refresh: true });
  if (!view) redirect({ href: "/", locale });
  const query = { t: token };
  if (view!.state === "PAID") redirect({ href: { pathname: "/payment/success", query }, locale });
  if (view!.state === "FAILED") redirect({ href: { pathname: "/payment/failed", query }, locale });
  if (view!.state === "NOT_STARTED" || view!.state === "ORDER_CANCELLED") {
    redirect({ href: `/checkout/pay/${token}`, locale });
  }

  const t = await getTranslations("payment");
  const settings = await getRestaurantSettings();

  return (
    <PaymentShell testNotice={view!.isTest ? t("testMode") : null}>
      <PaymentHeading icon="⏳" title={t("pending.title")} subtitle={t("pending.subtitle")} />
      <p className="mt-4 text-center text-sm font-semibold text-pizza-muted">
        {t("orderNumber", { number: view!.order.orderNumber })}
      </p>

      <div className="mt-6">
        <PaymentStatusPoller
          token={token}
          stayOn="PENDING"
          checkLabel={t("pending.checkNow")}
          checkingLabel={t("pending.checking")}
        />
      </div>

      {view!.hasOpenSession && (
        <div className="mx-auto mt-6 max-w-sm">
          <PayWithCardForm
            token={token}
            locale={locale}
            variant="outline"
            label={t("pending.resume")}
            busyLabel={t("review.paying")}
          />
        </div>
      )}

      <p className="mt-6 text-center text-sm text-pizza-muted">
        {t("pending.slow", { phone: settings.primaryPhone })}
      </p>
    </PaymentShell>
  );
}
