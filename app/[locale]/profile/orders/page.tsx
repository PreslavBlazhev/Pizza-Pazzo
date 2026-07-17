import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { requireUser } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("orders"), robots: { index: false, follow: false } };
}

// Session-dependent: must never be prerendered. See app/[locale]/admin/layout.tsx.
export const dynamic = "force-dynamic";

export default async function ProfileOrdersPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("profile");
  const tNav = await getTranslations("nav");
  const tCommon = await getTranslations("common");

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
            {tNav("profile")}
          </Link>
          <span aria-hidden>›</span>
          <span className="text-pizza-ink">{t("orders")}</span>
        </div>

        <h1 className="mt-3 font-display text-3xl font-bold text-pizza-ink sm:text-4xl">
          {t("orders")}
        </h1>

        {orders.length === 0 && (
          <div className="mt-8 rounded-3xl border border-dashed border-pizza-cream-dark bg-white px-6 py-14 text-center shadow-card">
            <p className="text-4xl" aria-hidden>
              🧾
            </p>
            <p className="mt-4 font-display text-xl font-semibold text-pizza-ink">
              {t("ordersEmpty")}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-pizza-muted">
              {t("ordersEmptyHint")}
            </p>
            <Link
              href="/menu"
              className="mt-7 inline-block rounded-full bg-brand px-8 py-3 font-semibold text-white shadow-soft transition hover:bg-brand-dark"
            >
              {tCommon("browseMenu")}
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
