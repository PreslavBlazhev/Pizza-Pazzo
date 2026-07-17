import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Потвърдете имейла си",
  robots: { index: false, follow: false },
};

/**
 * Shown after registration when Supabase has email confirmation enabled
 * (Dashboard → Authentication → Providers → Email → "Confirm email").
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <>
      <Header />
      <main className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pizza-green-light text-4xl">
          ✉️
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink">
          Проверете пощата си
        </h1>
        <p className="mt-4 max-w-md text-pizza-muted">
          Изпратихме линк за потвърждение
          {email ? (
            <>
              {" "}
              на <span className="font-semibold text-pizza-ink">{email}</span>
            </>
          ) : null}
          . Отворете го, за да активирате профила си.
        </p>
        <p className="mt-2 max-w-md text-sm text-pizza-muted/80">
          Ако не виждате имейла, проверете папка „Спам“.
        </p>
        <Link
          href="/auth/login"
          className="mt-8 rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
        >
          Към вход
        </Link>
      </main>
      <Footer />
    </>
  );
}
