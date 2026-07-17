import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { HeaderAuth } from "./HeaderAuth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { CartBadge } from "@/components/cart/CartBadge";

/** Nav targets. Labels come from the `nav` namespace, keyed by `labelKey`. */
export const NAV_LINKS = [
  { href: "/", labelKey: "home" },
  { href: "/menu", labelKey: "menu" },
  { href: "/gallery", labelKey: "gallery" },
  { href: "/reviews", labelKey: "reviews" },
  { href: "/contacts", labelKey: "contacts" },
] as const;

/**
 * Site header. Stays a server component: the auth-dependent part is isolated in
 * <HeaderAuth />, so pages using this header can still be statically rendered.
 *
 * Note the desktop breakpoint is `lg`, not `md` — the auth controls added
 * enough width that the nav wrapped on tablets.
 */
export function Header() {
  const t = useTranslations("nav");

  return (
    <header className="sticky top-0 z-40">
      <div className="container flex h-20 items-center justify-between gap-4">
        <Logo className="h-12 sm:h-14" priority />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 lg:flex" aria-label={t("mainNav")}>
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-base font-semibold text-pizza-ink/80 transition-colors hover:text-brand"
            >
              {t(l.labelKey)}
            </Link>
          ))}

          <span className="h-6 w-px bg-pizza-cream-dark" aria-hidden />

          <LanguageSwitcher />

          <HeaderAuth />

          <Link
            href="/cart"
            className="relative inline-flex items-center gap-2 rounded-full border border-pizza-green/40 bg-white px-4 py-2 text-base font-semibold text-pizza-green shadow-sm transition hover:bg-pizza-green hover:text-white"
          >
            <span aria-hidden>🛒</span> {t("cart")}
            <CartBadge />
          </Link>
        </nav>

        {/* Mobile: cart + hamburger */}
        <div className="flex items-center gap-1 lg:hidden">
          <Link
            href="/cart"
            aria-label={t("cart")}
            className="relative rounded-full p-2 text-2xl transition hover:bg-pizza-cream-dark/40"
          >
            <span aria-hidden>🛒</span>
            <CartBadge />
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
