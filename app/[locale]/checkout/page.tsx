import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getSessionUser } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

// Reads the session (to prefill) and the request — never prerender.
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("checkout");
  const user = await getSessionUser();
  const defaults = user
    ? { name: user.fullName, email: user.email, phone: user.phone ?? undefined }
    : undefined;

  return (
    <>
      <Header />
      <main className="container max-w-5xl py-10 sm:py-14">
        <h1 className="mb-8 font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
          {t("title")}
        </h1>
        <CheckoutForm defaults={defaults} />
      </main>
      <Footer />
    </>
  );
}
