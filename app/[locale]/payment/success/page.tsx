import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { PaymentShell, PaymentHeading } from "@/components/payment/PaymentShell";
import { PaymentOrderSummary } from "@/components/payment/PaymentOrderSummary";
import { PaymentSettled } from "@/components/payment/PaymentSettled";
import { getCustomerPaymentView } from "@/lib/payments/customer";
import { getRestaurantSettings } from "@/lib/restaurant-settings";
import { formatEurPrice } from "@/lib/format-price";
import type { Locale } from "@/i18n/routing";

/**
 * /payment/success?t=… — the thank-you page.
 *
 * It says "paid" only when the DATABASE says paid, and the database says so
 * only after the provider confirmed it server-to-server. Opening this URL for
 * an unpaid order just sends the visitor to the checking screen.
 */
interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment.success" });
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

export default async function PaymentSuccessPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { t: token = "" } = await searchParams;

  const view = await getCustomerPaymentView(token, { refresh: true });
  if (!view) redirect({ href: "/", locale });
  if (view!.state !== "PAID") {
    redirect({ href: { pathname: "/payment/return", query: { t: token } }, locale });
  }

  const { order } = view!;
  const t = await getTranslations("payment");
  const settings = await getRestaurantSettings();

  return (
    <PaymentShell testNotice={view!.isTest ? t("testMode") : null}>
      <PaymentSettled token={token} />
      <PaymentHeading icon="✓" tone="success" title={t("success.title")} subtitle={t("success.subtitle")} />

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <span className="rounded-full bg-pizza-green-light px-4 py-1.5 font-semibold text-pizza-green-dark">
          {t("orderNumber", { number: order.orderNumber })}
        </span>
        <span className="rounded-full bg-pizza-cream px-4 py-1.5 font-semibold text-pizza-ink">
          💳 {t("success.paid", { amount: formatEurPrice(order.totalEur) })}
        </span>
      </div>

      <div className="mt-8">
        <PaymentOrderSummary order={order} locale={locale} />
      </div>

      <section className="mt-8 rounded-2xl bg-pizza-cream p-5">
        <h2 className="font-semibold text-pizza-ink">{t("success.nextTitle")}</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-pizza-muted">
          <li>{t("success.next1")}</li>
          <li>{t("success.next2")}</li>
          <li>{t("success.next3", { phone: settings.primaryPhone })}</li>
        </ol>
      </section>

      <div className="mt-8 text-center">
        <Link
          href="/menu"
          className="inline-block rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
        >
          {t("backToMenu")}
        </Link>
      </div>
    </PaymentShell>
  );
}
