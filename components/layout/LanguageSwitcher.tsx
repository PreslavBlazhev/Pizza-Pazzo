"use client";

import { useId, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, LOCALE_SHORT_LABELS, LOCALE_LABELS, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Flags as inline SVG, not emoji: Windows renders 🇬🇧 as the bare letters
 * "GB", so an emoji flag would simply not be a flag for many visitors.
 * Decorative — the button around them carries the accessible name.
 */
function UnionJack({ className }: { className?: string }) {
  // Clip-path ids must be unique per instance (the switcher renders twice:
  // header bar and mobile menu).
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 60 30" aria-hidden focusable="false" className={className}>
      <clipPath id={`${id}s`}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={`${id}t`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${id}s)`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

function BulgarianFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 5 3" aria-hidden focusable="false" className={className}>
      <rect width="5" height="1" y="0" fill="#fff" />
      <rect width="5" height="1" y="1" fill="#00966E" />
      <rect width="5" height="1" y="2" fill="#D62612" />
    </svg>
  );
}

function Flag({ locale, className }: { locale: Locale; className?: string }) {
  const classes = cn("h-3.5 w-6 shrink-0 rounded-[2px] ring-1 ring-black/10", className);
  return locale === "en" ? <UnionJack className={classes} /> : <BulgarianFlag className={classes} />;
}

/**
 * BG / EN switch with flags — Bulgarian and British English (en-GB).
 *
 * Switching keeps the reader where they are — `/en/menu` ⇄ `/menu`, query
 * string included — rather than dropping them on the homepage. The language
 * lives in the URL, so it survives navigation (every link is locale-aware)
 * and a reload. The cart lives in localStorage and unsaved choices on the
 * product and checkout pages are kept in sessionStorage, so nothing typed or
 * picked is lost by switching.
 *
 * `compact` (the mobile header bar) shows ONE button: the flag of the other
 * language — the way there and, from English, the way back.
 */
export function LanguageSwitcher({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    // Read at click time rather than via useSearchParams, which would force
    // every statically rendered page into a Suspense boundary.
    const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- `params` is not statically known for the current
        // route, but the pathname it came from is always valid for both locales.
        { pathname, params, query },
        { locale: next, scroll: false }
      );
    });
  }

  if (compact) {
    const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
    return (
      <button
        type="button"
        onClick={() => switchTo(other)}
        disabled={isPending}
        lang={other === "en" ? "en-GB" : "bg"}
        aria-label={t(other === "en" ? "switchToEnglish" : "switchToBulgarian")}
        title={LOCALE_LABELS[other]}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-pizza-cream-dark bg-white px-2.5 text-xs font-bold uppercase tracking-wide text-pizza-ink shadow-sm transition hover:border-pizza-green/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 disabled:opacity-60",
          className
        )}
      >
        <Flag locale={other} />
        <span aria-hidden>{LOCALE_SHORT_LABELS[other]}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-pizza-cream-dark bg-white p-0.5",
        className
      )}
      role="group"
      aria-label={t("languageSwitcher")}
    >
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            disabled={isPending}
            aria-pressed={active}
            lang={l === "en" ? "en-GB" : "bg"}
            title={LOCALE_LABELS[l]}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pizza-green/50 disabled:opacity-60",
              active ? "bg-pizza-green text-white" : "text-pizza-muted hover:text-pizza-ink"
            )}
          >
            <Flag locale={l} />
            <span className="sr-only">{LOCALE_LABELS[l]}</span>
            <span aria-hidden>{LOCALE_SHORT_LABELS[l]}</span>
          </button>
        );
      })}
    </div>
  );
}
