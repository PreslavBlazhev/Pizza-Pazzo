import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { FormAlert } from "@/components/ui/FormAlert";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Checkout. The form is a Stage 4 placeholder — it renders but cannot submit.
 *
 * The page is prerendered (the locale params come from the layout above) and
 * that is fine while it reads no session: access is gated in `middleware.ts`,
 * which runs before any of this. Once Stage 4 reads the cart or the user here,
 * this needs `export const dynamic = "force-dynamic"` — as /profile has.
 */
export default function CheckoutPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("checkout");

  return (
    <>
      <Header />
      <main className="container max-w-3xl py-10 sm:py-14">
        <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
          {t("title")}
        </h1>
        <FormAlert tone="info" className="mt-4">
          {t("comingSoon")}
        </FormAlert>
        <div className="mt-6">
          <CheckoutForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
