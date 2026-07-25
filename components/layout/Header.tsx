import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { HeaderShell } from "./HeaderShell";
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
interface HeaderProps {
  /**
   * "home": transparent over the hero until the first scroll, and no brand
   * logo in the bar — the hero right below shows the big one. Every other
   * page uses "default": solid background and the logo from the start.
   */
  variant?: "default" | "home";
}

export function Header({ variant = "default" }: HeaderProps) {
  const t = useTranslations("nav");
  const isHome = variant === "home";

  return (
    <HeaderShell transparentAtTop={isHome}>
      <div className="container flex h-20 items-center justify-between gap-4">
        {/* On the homepage the logo is hidden; the empty span keeps
            justify-between so the nav stays pinned to the right. */}
        {isHome ? <span aria-hidden /> : <Logo className="h-12 sm:h-14" priority />}

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
    </HeaderShell>
  );
}
