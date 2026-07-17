import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Logo } from "@/components/layout/Logo";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductCard } from "@/components/menu/ProductCard";
import { GallerySection } from "@/components/home/GallerySection";
import { ReviewsSection } from "@/components/home/ReviewsSection";
import { getCategories, getPopularProducts } from "@/lib/menu-data";
import { SITE } from "@/lib/constants";
import type { Locale } from "@/i18n/routing";

/** Keys into the `home.values` namespace, paired with their icon. */
const VALUES = [
  { key: "wood", icon: "🔥" },
  { key: "fresh", icon: "🌿" },
  { key: "easy", icon: "⚡" },
] as const;

export default function HomePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("home");
  const tCommon = useTranslations("common");

  // Exclude add-on categories from the homepage showcase (kept in the full menu).
  const categories = getCategories(locale).filter((c) => !c.id.includes("addons"));
  const popular = getPopularProducts(locale);

  return (
    <>
      <Header />
      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* soft decorative blobs */}
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-pizza-green-light blur-3xl" />
          <div className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-pizza-red-light blur-3xl" />

          <div className="container relative flex flex-col items-center py-16 text-center sm:py-24">
            <Logo className="h-28 sm:h-40" linked={false} priority />

            <span className="mt-8 inline-block rounded-full border border-pizza-green/30 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-pizza-green">
              {t("hero.badge")}
            </span>

            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight text-pizza-ink sm:text-6xl">
              {t("hero.titleLead")}{" "}
              <span className="text-brand">{t("hero.titleAccent")}</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pizza-muted">
              {t("hero.subtitle")}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/menu"
                className="rounded-full bg-brand px-8 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2"
              >
                {t("hero.ctaMenu")}
              </Link>
              <Link
                href="/popular"
                className="rounded-full border border-pizza-green bg-white px-8 py-3.5 font-semibold text-pizza-green transition hover:bg-pizza-green hover:text-white"
              >
                {t("hero.ctaPopular")}
              </Link>
            </div>

            {/* Trust strip */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-pizza-muted">
              <span>{t("hero.trustDelivery")}</span>
              <span className="hidden text-pizza-cream-dark sm:inline">•</span>
              <span>{t("hero.trustSince", { year: SITE.foundedYear })}</span>
              <span className="hidden text-pizza-cream-dark sm:inline">•</span>
              <span>{t("hero.trustDough")}</span>
            </div>
          </div>
        </section>

        {/* ── Categories ───────────────────────────────────────── */}
        <section className="container py-16 sm:py-20">
          <SectionHeading
            center
            eyebrow={t("categories.eyebrow")}
            title={t("categories.title")}
            subtitle={t("categories.subtitle")}
          />
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/menu/${c.slug}`}
                className="group flex flex-col items-center rounded-3xl border border-pizza-cream-dark bg-white p-6 text-center shadow-card transition hover:-translate-y-1 hover:border-pizza-green/40 hover:shadow-soft"
              >
                <span className="text-4xl transition group-hover:scale-110">
                  {c.icon}
                </span>
                <span className="mt-3 font-display text-lg font-semibold text-pizza-ink">
                  {c.name}
                </span>
                <span className="mt-1 text-xs text-pizza-muted">
                  {tCommon("viewAllArrow")}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Popular products ─────────────────────────────────── */}
        {popular.length > 0 && (
          <section className="bg-white py-16 sm:py-20">
            <div className="container">
              <SectionHeading
                center
                eyebrow={t("popular.eyebrow")}
                title={t("popular.title")}
                subtitle={t("popular.subtitle")}
              />
              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {popular.slice(0, 4).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <div className="mt-10 text-center">
                <Link
                  href="/popular"
                  className="inline-block rounded-full border border-pizza-ink/15 px-8 py-3 font-semibold text-pizza-ink transition hover:border-brand hover:text-brand"
                >
                  {t("popular.viewAll")}
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Gallery ──────────────────────────────────────────── */}
        <GallerySection />

        {/* ── Reviews ──────────────────────────────────────────── */}
        <ReviewsSection />

        {/* ── Values ───────────────────────────────────────────── */}
        <section className="container py-16 sm:py-20">
          <div className="grid gap-6 sm:grid-cols-3">
            {VALUES.map((v) => (
              <div
                key={v.key}
                className="rounded-3xl border border-pizza-cream-dark bg-white p-8 text-center shadow-card"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pizza-green-light text-3xl">
                  {v.icon}
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold text-pizza-ink">
                  {t(`values.${v.key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-pizza-muted">
                  {t(`values.${v.key}.text`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA band ─────────────────────────────────────────── */}
        <section className="bg-pizza-green">
          <div className="container flex flex-col items-center gap-6 py-14 text-center text-white sm:py-16">
            <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">
              {t("cta.title")}
            </h2>
            <p className="max-w-xl text-white/85">{t("cta.subtitle")}</p>
            <Link
              href="/menu"
              className="rounded-full bg-white px-8 py-3.5 font-semibold text-pizza-green shadow-soft transition hover:bg-pizza-cream"
            >
              {t("cta.button")}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
