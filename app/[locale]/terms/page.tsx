import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { termsDoc } from "@/content/legal/terms";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("terms") };
}

export default function TermsPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("legal");

  return (
    <>
      <Header />
      <main>
        <PageHero eyebrow={t("eyebrow")} title={t("terms")} />
        <div className="container pb-24 pt-10">
          <LegalArticle doc={termsDoc} locale={locale} />
        </div>
      </main>
      <Footer />
    </>
  );
}
