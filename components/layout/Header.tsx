import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { HeaderShell } from "./HeaderShell";
import { MobileNav } from "./MobileNav";
import { HeaderAuth } from "./HeaderAuth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoPhone } from "./CallNow";
import { NAV_LINKS } from "./nav-links";
import { CartBadge } from "@/components/cart/CartBadge";

export { NAV_LINKS };

/**
 * Site header. Stays a server component: the auth-dependent part is isolated in
 * <HeaderAuth />, and the phone under the logo is a cached settings read, so
 * pages using this header can still be statically rendered.
 *
 * Note the desktop breakpoint is `lg`, not `md` — the auth controls added
 * enough width that the nav wrapped on tablets.
 */
interface HeaderProps {
  /**
   * "home": transparent over the hero until the first scroll, and no brand
   * logo in the bar — the hero right below shows the big one (with the phone
   * under it). Every other page uses "default": solid background and the
   * logo with the phone from the start.
   */
  variant?: "default" | "home";
}

export async function Header({ variant = "default" }: HeaderProps) {
  const t = await getTranslations("nav");
  const isHome = variant === "home";

  return (
    <HeaderShell transparentAtTop={isHome}>
      <div className="container flex h-20 items-center justify-between gap-4">
        {/* On the homepage the logo is hidden; the empty span keeps
            justify-between so the nav stays pinned to the right. */}
        {isHome ? (
          <span aria-hidden />
        ) : (
          <div className="flex flex-col items-start gap-0.5">
            <Logo className="h-10 sm:h-11" priority />
            <LogoPhone className="text-xs sm:text-sm" />
          </div>
        )}

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

        {/* Mobile: language flag + cart + hamburger. The switcher sits in the
            bar itself (not only inside the menu) so English is one tap away. */}
        <div className="flex items-center gap-1.5 lg:hidden">
          <LanguageSwitcher compact />
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
