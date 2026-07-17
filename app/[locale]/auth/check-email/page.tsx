import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ email?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.checkEmail" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Shown after registration when Supabase has email confirmation enabled
 * (Dashboard → Authentication → Providers → Email → "Confirm email").
 */
export default async function CheckEmailPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { email } = await searchParams;
  const t = await getTranslations("auth.checkEmail");

  return (
    <>
      <Header />
      <main className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pizza-green-light text-4xl">
          ✉️
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-md text-pizza-muted">
          {email
            ? t.rich("sentLinkTo", {
                email,
                // The address sits inside the sentence, so the emphasis has to
                // travel with the translation rather than be spliced in around
                // it — word order differs between the two languages.
                strong: (chunks) => (
                  <span className="font-semibold text-pizza-ink">{chunks}</span>
                ),
              })
            : t("sentLink")}
        </p>
        <p className="mt-2 max-w-md text-sm text-pizza-muted/80">
          {t("spamNote")}
        </p>
        <Link
          href="/auth/login"
          className="mt-8 rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
        >
          {t("backToLogin")}
        </Link>
      </main>
      <Footer />
    </>
  );
}
