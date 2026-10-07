import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { FormAlert } from "@/components/ui/FormAlert";
import { PaymentShell, PaymentHeading } from "@/components/payment/PaymentShell";
import { PaymentOrderSummary } from "@/components/payment/PaymentOrderSummary";
import { PayWithCardForm } from "@/components/payment/PayWithCardForm";
import { getCustomerPaymentView } from "@/lib/payments/customer";
import { formatEurPrice } from "@/lib/format-price";
import type { Locale } from "@/i18n/routing";

/**
 * /checkout/pay/{token} — Pizza Pazzo's own review screen before the bank.
 *
 * Shows the order exactly as the server stored and priced it, the payment
 * method and the amount, and one action: "Плати с карта". Card details are
 * NOT asked for here — the button leads to the provider's hosted page.
 */
interface PageProps {
  params: Promise<{ locale: Locale; token: string }>;
  searchParams: Promise<{ error?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment.review" });
  // The token is a key to this order: keep it out of indexes and Referer headers.
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

const ERROR_CODES = [
  "DISABLED",
  "BUSY",
  "PROVIDER_ERROR",
  "STORE_CLOSED",
  "NOT_FOUND",
  "NOT_CARD",
  "ALREADY_PAID",
  "ORDER_CANCELLED",
  "UNCONFIRMED",
  "RATE_LIMITED",
] as const;
type ErrorCode = (typeof ERROR_CODES)[number];

export default async function PayPage({ params, searchParams }: PageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;

  const view = await getCustomerPaymentView(token, { refresh: true, refreshIntervalMs: 3000 });
  if (!view || view.state === "NOT_CARD") notFound();
  if (view.state === "PAID") redirect({ href: { pathname: "/payment/success", query: { t: token } }, locale });

  const t = await getTranslations("payment");
  const { order } = view;
  const errorCode = (ERROR_CODES as readonly string[]).includes(error ?? "")
    ? (error as ErrorCode)
    : null;

  if (view.state === "ORDER_CANCELLED") {
    return (
      <PaymentShell>
        <PaymentHeading icon="✕" tone="error" title={t("cancelled.title")} subtitle={t("cancelled.subtitle")} />
        <div className="mt-6 text-center">
          <Link href="/menu" className="font-semibold text-brand underline">
            {t("backToMenu")}
          </Link>
        </div>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell testNotice={view.isTest ? t("testMode") : null}>
      <p className="text-sm font-semibold text-pizza-muted">
        {t("orderNumber", { number: order.orderNumber })}
      </p>
      <h1 className="mt-1 font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        {t("review.title")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-pizza-muted">
        {t("review.intro", { provider: view.providerName[locale] })}
      </p>

      {errorCode && (
        <FormAlert tone="error" className="mt-5">
          {t(`errors.${errorCode}`)}
        </FormAlert>
      )}

      <div className="mt-6">
        <PaymentOrderSummary order={order} locale={locale} />
      </div>

      <dl className="mt-5 grid gap-2 rounded-2xl bg-pizza-cream p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-pizza-muted">{t("review.method")}</dt>
          <dd className="font-semibold text-pizza-ink">💳 {t("review.methodCard")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-pizza-muted">{t("review.totalToPay")}</dt>
          <dd className="text-lg font-bold text-pizza-ink">{formatEurPrice(order.totalEur)}</dd>
        </div>
      </dl>

      {view.hasOpenSession && (
        <FormAlert tone="info" className="mt-5">
          {t("review.resumeHint")}
        </FormAlert>
      )}

      <div className="mt-6 space-y-3">
        <PayWithCardForm
          token={token}
          locale={locale}
          label={t("review.pay", { amount: formatEurPrice(order.totalEur) })}
          busyLabel={t("review.paying")}
        />
        <p className="text-center text-xs text-pizza-muted">🔒 {t("review.kitchenNotice")}</p>
        <p className="text-center text-sm">
          <Link href="/checkout" className="text-pizza-muted underline hover:text-brand">
            {t("review.changeOrder")}
          </Link>
        </p>
      </div>
    </PaymentShell>
  );
}
