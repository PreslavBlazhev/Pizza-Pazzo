import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getSessionUser } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.register" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

// Reads the session to bounce signed-in users; must not be prerendered.
export const dynamic = "force-dynamic";

export default async function RegisterPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("auth");

  const user = await getSessionUser();
  if (user) redirect({ href: "/profile", locale });

  return (
    <>
      <Header />
      <main className="container flex justify-center py-16 sm:py-20">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-pizza-ink">
              {t("register.title")}
            </h1>
            <p className="mt-2 text-sm text-pizza-muted">
              {t("register.subtitle")}
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card sm:p-8">
            <RegisterForm />
          </div>

          <p className="mt-6 text-center text-sm text-pizza-muted">
            {t("register.hasAccount")}{" "}
            <Link
              href="/auth/login"
              className="font-semibold text-pizza-green hover:underline"
            >
              {t("register.loginLink")}
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
