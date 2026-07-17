import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartView } from "@/components/cart/CartView";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  return { title: t("title") };
}

/**
 * Cart page. A static server shell around the client <CartView />, which reads
 * the persisted cart on the client — so this page stays statically rendered.
 */
export default function CartPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("cart");

  return (
    <>
      <Header />
      <main className="container py-12 sm:py-16">
        <h1 className="mb-8 text-center font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        <CartView />
      </main>
      <Footer />
    </>
  );
}
