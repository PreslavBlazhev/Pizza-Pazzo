import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { FormAlert } from "@/components/ui/FormAlert";
import { getAuthUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Регистрация",
  description: "Създайте профил в Pizza Pazzo и поръчвайте по-бързо.",
  robots: { index: false, follow: false },
};

// Reads the session to bounce signed-in users; must not be prerendered.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getAuthUser();
  if (user) redirect("/profile");

  const configured = isSupabaseConfigured();

  return (
    <>
      <Header />
      <main className="container flex justify-center py-16 sm:py-20">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-pizza-ink">
              Създайте профил
            </h1>
            <p className="mt-2 text-sm text-pizza-muted">
              Запазете адреса си и поръчвайте с няколко клика.
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-pizza-cream-dark bg-white p-6 shadow-card sm:p-8">
            {!configured && (
              <FormAlert tone="info" className="mb-5">
                Тази секция ще се активира след конфигуриране на Supabase.
              </FormAlert>
            )}

            <RegisterForm />
          </div>

          <p className="mt-6 text-center text-sm text-pizza-muted">
            Вече имате профил?{" "}
            <Link
              href="/auth/login"
              className="font-semibold text-pizza-green hover:underline"
            >
              Влезте
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
