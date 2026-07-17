import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Моите поръчки",
  robots: { index: false, follow: false },
};

// Session-dependent: must never be prerendered. See app/admin/layout.tsx.
export const dynamic = "force-dynamic";

export default async function ProfileOrdersPage() {
  await requireUser("/profile/orders");

  // Orders are not built yet — this is a real empty state, not a placeholder.
  // When the orders table exists, fetch the user's orders here and render the
  // list; the empty state below stays as the zero-orders case.
  const orders: never[] = [];

  return (
    <>
      <Header />
      <main className="container max-w-3xl py-12 sm:py-16">
        <div className="flex items-center gap-3 text-sm text-pizza-muted">
          <Link href="/profile" className="transition hover:text-brand">
            Профил
          </Link>
          <span aria-hidden>›</span>
          <span className="text-pizza-ink">Моите поръчки</span>
        </div>

        <h1 className="mt-3 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          Моите поръчки
        </h1>

        {orders.length === 0 && (
          <div className="mt-8 rounded-3xl border border-dashed border-pizza-cream-dark bg-white px-6 py-14 text-center shadow-card">
            <p className="text-4xl" aria-hidden>
              🧾
            </p>
            <p className="mt-4 font-display text-xl font-semibold text-pizza-ink">
              Все още нямате поръчки.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-pizza-muted">
              След като направите поръчка, тя ще се появи тук.
            </p>
            <Link
              href="/menu"
              className="mt-7 inline-block rounded-full bg-brand px-8 py-3 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              Разгледай менюто
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
