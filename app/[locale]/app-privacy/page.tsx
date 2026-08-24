import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { appPrivacyDoc } from "@/content/legal/appPrivacy";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Privacy policy for the "Pizza Pazzo Kitchen" Android app.
 *
 * Google Play requires a publicly reachable privacy-policy URL for every app,
 * and it must be readable without signing in — hence a normal public page and
 * not something behind /admin. It is deliberately NOT linked from the footer:
 * the app is a staff tool, and a customer clicking "privacy" wants the site's
 * policy at /privacy, not this one. The link lives in the Play Console listing
 * (see android-kitchen-app/PLAY_STORE.md).
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
  return { title: t("appPrivacy"), description: tMeta("appPrivacy.description") };
}

export default function AppPrivacyPage({ params }: PageProps) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("legal");

  return (
    <>
      <Header />
      <main>
        <PageHero eyebrow={t("eyebrow")} title={t("appPrivacy")} />
        <div className="container pb-24 pt-10">
          <LegalArticle doc={appPrivacyDoc} locale={locale} />
        </div>
      </main>
      <Footer />
    </>
  );
}
