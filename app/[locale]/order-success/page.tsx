import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import type { Locale } from "@/i18n/routing";
import { db } from "@/lib/db";
import { isValidOrderReceipt } from "@/lib/checkout/receipt";
import { CallNowButton } from "@/components/layout/CallNow";

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ n?: string; r?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "orderSuccess" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

// Reads ?n= from the request — dynamic.
export const dynamic = "force-dynamic";

export default async function OrderSuccessPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { n, r } = await searchParams;
  const t = await getTranslations("orderSuccess");

  // "Received" only for an order that exists AND that this server just handed
  // to this browser (the signed receipt) — never for a bare ?n= in the URL.
  const number = n && /^\d{1,9}$/.test(n) ? Number(n) : null;
  const confirmed =
    number !== null &&
    isValidOrderReceipt(number, r) &&
    (await db.order.findUnique({ where: { orderNumber: number }, select: { id: true } })) !== null;
  const orderNumber = confirmed ? String(number) : null;

  if (!confirmed) {
    return (
      <>
        <Header />
        <main className="container flex flex-col items-center py-20 text-center sm:py-28">
          <h1 className="font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
            {t("unconfirmedTitle")}
          </h1>
          <p className="mt-4 max-w-lg leading-relaxed text-pizza-muted">{t("unconfirmedBody")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/checkout"
              className="rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              {t("backToCheckout")}
            </Link>
            <CallNowButton />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="container flex flex-col items-center py-20 text-center sm:py-28">
        <div className="text-5xl">🍕</div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        {orderNumber && (
          <p className="mt-4 rounded-full bg-pizza-green-light px-5 py-2 font-semibold text-pizza-green-dark">
            {t("orderNumber", { number: orderNumber })}
          </p>
        )}
        <p className="mt-4 max-w-lg leading-relaxed text-pizza-muted">
          {t("subtitle")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/track"
            className="rounded-full bg-pizza-green px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-pizza-green-dark"
            data-testid="track-link"
          >
            {t("trackLink")}
          </Link>
          <Link
            href="/menu"
            className="rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
          >
            {t("backToMenu")}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
