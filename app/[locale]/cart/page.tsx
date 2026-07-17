import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SITE } from "@/lib/constants";
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
 * The cart itself arrives in Stage 2. Until then this page points at the phone
 * rather than showing the word "Placeholder" to a customer.
 */
export default function CartPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("cart");
  const tCommon = useTranslations("common");

  return (
    <>
      <Header />
      <main className="container flex flex-col items-center py-20 text-center sm:py-28">
        <div className="text-5xl">🛒</div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-lg leading-relaxed text-pizza-muted">
          {t("comingSoon")}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={`tel:${SITE.phone.replace(/\s/g, "")}`}
            className="rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
          >
            📞 {SITE.phone}
          </a>
          <Link
            href="/menu"
            className="rounded-full border border-pizza-green bg-white px-8 py-3.5 font-semibold text-pizza-green transition hover:bg-pizza-green hover:text-white"
          >
            {tCommon("browseMenu")}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
