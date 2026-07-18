import type { Metadata } from "next";
import { Lora, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { SITE, SITE_URL } from "@/lib/constants";
import { getRestaurantJsonLd } from "@/lib/seo/structured-data";
import { routing, type Locale } from "@/i18n/routing";

const display = Lora({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

/** Pre-render both locales at build time instead of on first request. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    // Without metadataBase every Open Graph image and canonical URL resolves
    // against localhost, which breaks the card whenever the site is shared.
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${SITE.name} — ${t("tagline")}`,
      template: `%s | ${SITE.name}`,
    },
    description: t("description"),
    /**
     * hreflang for the homepage. Without it Google treats /  and /en as two
     * competing pages rather than two languages of one, and picks one to rank.
     *
     * Per-page alternates are not set here: this layout cannot know the child's
     * path. The homepage is the one that matters most and it is covered; the
     * sitemap declares the rest.
     */
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages: {
        bg: "/",
        en: "/en",
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: locale === "bg" ? "bg_BG" : "en_GB",
      title: `${SITE.name} — ${t("tagline")}`,
      description: t("description"),
      url: locale === routing.defaultLocale ? "/" : `/${locale}`,
      // og:image comes from app/[locale]/opengraph-image.tsx (file convention).
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE.name} — ${t("tagline")}`,
      description: t("description"),
      // twitter:image comes from app/[locale]/twitter-image.tsx.
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  // `params` is `string` here rather than `Locale`: an unknown locale must be
  // able to reach `hasLocale` below, not be typed out of existence.
  const { locale } = await params;

  // An unknown locale must 404 rather than fall back silently — otherwise
  // `/de/menu` would quietly serve Bulgarian under a German URL.
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for the pages below to stay statically rendered.
  setRequestLocale(locale);

  const restaurantJsonLd = getRestaurantJsonLd(locale);

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-pizza-cream font-sans text-pizza-ink antialiased">
        {/* schema.org Restaurant data for rich results. The `<` escape keeps a
            hypothetical "</script>" inside the data from closing the tag. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(restaurantJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
