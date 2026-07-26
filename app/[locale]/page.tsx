import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Logo } from "@/components/layout/Logo";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductCard } from "@/components/menu/ProductCard";
import { GallerySection } from "@/components/home/GallerySection";
import { ReviewsSection } from "@/components/home/ReviewsSection";
import {
  PizzaMathPromo,
  PromoBannersCarousel,
  TwoToppingsPromo,
} from "@/components/home/PromoBanners";
import { getCategories, getPopularProducts } from "@/lib/menu-data";
import { SITE } from "@/lib/constants";
import type { Locale } from "@/i18n/routing";

/** Keys into the `home.values` namespace, paired with their icon. */
const VALUES = [
  { key: "wood", icon: "🔥" },
  { key: "fresh", icon: "🌿" },
  { key: "easy", icon: "⚡" },
] as const;

// The menu lives in the database, which on Render is not available at build
// time — so this page renders on demand; the data layer itself is cached and
// tag-invalidated on admin edits (see lib/menu-data.ts).
export const dynamic = "force-dynamic";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "home" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  // Exclude add-on categories from the homepage showcase (kept in the full menu).
  const categories = (await getCategories(locale)).filter(
    (c) => !c.id.includes("addons")
  );
  const popular = await getPopularProducts(locale);

  return (
    <>
      <Header variant="home" />
      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        {/* No decorative colour blobs here on purpose: the hero sits directly
            on the cream + food-doodle page background, evenly, with no tinted
            glow at the edges. */}
        {/* Decorative assets pending: <HeroDecorations /> (herbs on the left,
            tomatoes on the right) is written and ready in
            components/home/HeroDecorations.tsx, but it is deliberately NOT
            rendered yet — the two cutout images it points at do not exist, and
            shipping it would make the homepage request two 404s. Re-enable by
            importing it and dropping it in here, once
            public/images/decor/herbs-left.webp and tomatoes-right.webp land.

            The classes below are the layering context that component needs:
            `isolate` keeps its negative z-index inside this section — above the
            page's doodle background, below the boards and the central column —
            and `overflow-clip` swallows artwork running past the viewport edge
            without ever creating a scrollbar. Both are inert until then. */}
        <section className="relative isolate overflow-clip">
          {/* Desktop puts a promo board on each side of the hero; below `lg`
              the middle column is the whole row and the boards move under it
              as a swipeable carousel. Vertical rhythm tightens on `lg` so the
              logo, heading, badge, CTAs and both boards fit a 1366×768 screen
              without scrolling. */}
          <div className="container py-16 sm:py-20 lg:grid lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)_minmax(180px,240px)] lg:items-center lg:gap-8 lg:py-10">
            <TwoToppingsPromo className="hidden lg:block" />

            <div className="flex flex-col items-center text-center">
              {/* The bar above hides its logo on this page, so this is the only
                  (and therefore bigger) brand mark above the fold. Height-based
                  sizing + w-auto keeps the PNG's aspect ratio; at h-40 the logo
                  is ~283px wide and still fits a 360px viewport with the
                  container padding. */}
              <Logo className="h-40 sm:h-56 lg:h-44" linked={false} priority />

              {/* Slogan — font-slogan (Yeseva One) echoes the carved-serif "PIZZA
                  PAZZO" lettering in the logo above; tracking is deliberately
                  lighter than a sans-serif badge would use, since the display
                  face is already wide and dense at small sizes. */}
              <span className="mt-8 inline-block rounded-full border border-pizza-green/30 bg-white/70 px-5 py-2 font-slogan text-sm uppercase leading-none tracking-wide text-pizza-green sm:text-base lg:mt-6">
                {t("hero.badge")}
              </span>

              {/* font-slogan (Yeseva One, single 400 weight — no font-bold, it
                  would only synthesize a faux bold) matches the carved-serif
                  "PIZZA PAZZO" lettering of the logo and covers Cyrillic. */}
              <h1 className="mt-5 max-w-3xl font-slogan text-4xl leading-tight text-pizza-ink sm:text-6xl lg:mt-4 lg:text-5xl">
                {t("hero.titleLead")}{" "}
                <span className="text-brand">{t("hero.titleAccent")}</span>
              </h1>

              {/* Standing promotional line — a fixed message, not a day-of-week
                  check: it reads louder than the subtitle, quieter than the H1.
                  brand-dark on the tinted fill clears AA comfortably, where the
                  lighter brand red sat close to the 4.5:1 floor. */}
              <p className="mt-4 inline-flex items-center gap-2.5 rounded-full border-2 border-brand/55 bg-brand/15 px-6 py-2 text-sm font-bold uppercase tracking-wide text-brand-dark sm:text-base lg:mt-3">
                <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />
                {t("pizzaThursday")}
              </p>

              <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-pizza-muted lg:mt-3 lg:text-base">
                {t("hero.subtitle")}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row lg:mt-6">
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
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-pizza-muted lg:mt-6">
                <span>{t("hero.trustDelivery")}</span>
                <span className="hidden text-pizza-cream-dark sm:inline">•</span>
                <span>{t("hero.trustSince", { year: SITE.foundedYear })}</span>
                <span className="hidden text-pizza-cream-dark sm:inline">•</span>
                <span>{t("hero.trustDough")}</span>
              </div>

              <PromoBannersCarousel />
            </div>

            <PizzaMathPromo className="hidden lg:block" />
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
