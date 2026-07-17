"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, LOCALE_SHORT_LABELS, LOCALE_LABELS, type Locale } from "@/i18n/routing";

/**
 * BG / EN toggle.
 *
 * Switching keeps the reader where they are — `/en/menu` ⇄ `/menu` — rather
 * than dropping them on the homepage. `usePathname` from `@/i18n/navigation`
 * returns the path *without* the locale prefix, so passing it back to `replace`
 * with a new locale is all that is needed. Dynamic segments (`/product/[id]`)
 * are carried over via `params`.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- `params` is not statically known for the current
        // route, but the pathname it came from is always valid for both locales.
        { pathname, params },
        { locale: next }
      );
    });
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border border-pizza-cream-dark bg-white p-0.5 ${className}`}
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
            aria-current={active ? "true" : undefined}
            title={LOCALE_LABELS[l]}
            className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition disabled:opacity-60 ${
              active
                ? "bg-pizza-green text-white"
                : "text-pizza-muted hover:text-pizza-ink"
            }`}
          >
            <span className="sr-only">{LOCALE_LABELS[l]}</span>
            <span aria-hidden>{LOCALE_SHORT_LABELS[l]}</span>
          </button>
        );
      })}
    </div>
  );
}
