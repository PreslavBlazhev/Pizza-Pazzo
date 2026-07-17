import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LoginForm } from "@/components/auth/LoginForm";
import { FormAlert } from "@/components/ui/FormAlert";
import { getAuthUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Вход",
  description: "Влезте в профила си в Pizza Pazzo.",
  robots: { index: false, follow: false },
};

// Reads the session to bounce signed-in users; must not be prerendered.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  // Already signed in → no reason to show the form.
  const user = await getAuthUser();
  if (user) redirect(redirectTo?.startsWith("/") ? redirectTo : "/profile");

  const configured = isSupabaseConfigured();

  return (
    <>
      <Header />
      <main className="container flex justify-center py-16 sm:py-20">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-pizza-ink">
              Вход в профила
            </h1>
            <p className="mt-2 text-sm text-pizza-muted">
              Влезте, за да поръчвате по-бързо.
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card sm:p-8">
            {!configured && (
              <FormAlert tone="info" className="mb-5">
                Тази секция ще се активира след конфигуриране на Supabase.
              </FormAlert>
            )}

            <LoginForm redirectTo={redirectTo} />

            <p className="mt-4 text-center text-xs text-pizza-muted">
              {/* TODO: real password reset — needs Supabase email templates. */}
              Забравена парола? Обадете ни се и ще помогнем.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-pizza-muted">
            Нямате профил?{" "}
            <Link
              href="/auth/register"
              className="font-semibold text-pizza-green hover:underline"
            >
              Регистрация
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
