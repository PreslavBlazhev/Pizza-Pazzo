import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PaymentShell, PaymentHeading } from "@/components/payment/PaymentShell";
import { PaymentStatusPoller } from "@/components/payment/PaymentStatusPoller";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * /payment/return?t=… — the "checking your payment" screen the customer sees
 * straight after the bank. It does not trust how it was reached (a success
 * URL proves nothing): it asks the server, which asks the provider, and only
 * then moves on to the paid / pending / failed page.
 */
interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment.pending" });
  return { title: t("checking"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { t: token = "" } = await searchParams;
  const t = await getTranslations("payment");
  const valid = /^[A-Za-z0-9_-]{16,64}$/.test(token);

  return (
    <PaymentShell>
      <PaymentHeading icon="🔒" title={t("pending.checking")} />
      <div className="mt-6">
        {valid ? (
          <PaymentStatusPoller token={token} checkingLabel={t("pending.checking")} />
        ) : (
          <p className="text-center">
            <Link href="/" className="font-semibold text-brand underline">
              {t("backToMenu")}
            </Link>
          </p>
        )}
      </div>
      {valid && (
        <noscript>
          <p className="mt-6 text-center">
            <a href={`${locale === "en" ? "/en" : ""}/payment/pending?t=${token}`} className="underline">
              {t("pending.checkNow")}
            </a>
          </p>
        </noscript>
      )}
    </PaymentShell>
  );
}
