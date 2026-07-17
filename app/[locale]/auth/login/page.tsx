import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ redirectTo?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

// Reads the session to bounce signed-in users; must not be prerendered.
export const dynamic = "force-dynamic";

export default async function LoginPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { redirectTo } = await searchParams;
  const t = await getTranslations("auth");

  // Already signed in → no reason to show the form.
  const user = await getSessionUser();
  if (user) {
    redirect({
      href: redirectTo?.startsWith("/") ? redirectTo : "/profile",
      locale,
    });
  }

  return (
    <>
      <Header />
      <main className="container flex justify-center py-16 sm:py-20">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-pizza-ink">
              {t("login.title")}
            </h1>
            <p className="mt-2 text-sm text-pizza-muted">
              {t("login.subtitle")}
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card sm:p-8">
            <LoginForm redirectTo={redirectTo} />

            <p className="mt-4 text-center text-xs text-pizza-muted">
              {/* TODO: real password reset flow. */}
              {t("login.forgotPassword")}
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-pizza-muted">
            {t("login.noAccount")}{" "}
            <Link
              href="/auth/register"
              className="font-semibold text-pizza-green hover:underline"
            >
              {t("login.registerLink")}
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
