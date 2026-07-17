import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Нямате достъп",
  robots: { index: false, follow: false },
};

export default function UnauthorizedPage() {
  return (
    <>
      <Header />
      <main className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pizza-red-light text-4xl">
          🔒
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          Нямате достъп до тази страница.
        </h1>
        <p className="mt-4 max-w-md text-pizza-muted">
          Страницата е достъпна само за служители на ресторанта. Ако смятате, че
          това е грешка, свържете се с администратор.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/profile"
            className="rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
          >
            Към моя профил
          </Link>
          <Link
            href="/"
            className="rounded-full border border-pizza-green bg-white px-8 py-3.5 font-semibold text-pizza-green transition hover:bg-pizza-green hover:text-white"
          >
            Начална страница
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
