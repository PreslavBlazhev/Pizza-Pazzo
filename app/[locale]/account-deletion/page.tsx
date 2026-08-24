import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { accountDeletionDoc } from "@/content/legal/accountDeletion";
import { routing, type Locale } from "@/i18n/routing";

/**
 * The public "delete your account" page Google Play requires alongside the
 * in-app path: it must work for someone who has already uninstalled the app,
 * so it is a plain public URL with no sign-in of any kind. Its address goes
 * into Play Console → Data safety → Data deletion.
 *
 * Unlike /app-privacy this one IS worth linking from the footer — a customer
 * looking for it should be able to find it without being told the URL.
 */
interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  const tMeta = await getTranslations({ locale, namespace: "meta.legal" });
  return {
    title: t("accountDeletion"),
    description: tMeta("accountDeletion.description"),
  };
}

export default function AccountDeletionPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("legal");

  return (
    <>
      <Header />
      <main>
        <PageHero eyebrow={t("eyebrow")} title={t("accountDeletion")} />
        <div className="container pb-24 pt-10">
          <LegalArticle doc={accountDeletionDoc} locale={locale} />
        </div>
      </main>
      <Footer />
    </>
  );
}
