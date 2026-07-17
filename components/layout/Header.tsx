import Link from "next/link";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { HeaderAuth } from "./HeaderAuth";

export const NAV_LINKS = [
  { href: "/", label: "Начало" },
  { href: "/menu", label: "Меню" },
  { href: "/gallery", label: "Галерия" },
  { href: "/reviews", label: "Отзиви" },
  { href: "/contacts", label: "Контакти" },
] as const;

/**
 * Site header. Stays a server component: the auth-dependent part is isolated in
 * <HeaderAuth />, so pages using this header can still be statically rendered.
 *
 * Note the desktop breakpoint is `lg`, not `md` — the auth controls added
 * enough width that the nav wrapped on tablets.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40">
      <div className="container flex h-20 items-center justify-between gap-4">
        <Logo className="h-12 sm:h-14" priority />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Основна навигация">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-base font-semibold text-pizza-ink/80 transition-colors hover:text-brand"
            >
              {l.label}
            </Link>
          ))}

          <span className="h-6 w-px bg-pizza-cream-dark" aria-hidden />

          <HeaderAuth />

          <Link
            href="/cart"
            className="inline-flex items-center gap-2 rounded-full border border-pizza-green/40 bg-white px-4 py-2 text-base font-semibold text-pizza-green shadow-sm transition hover:bg-pizza-green hover:text-white"
          >
            <span aria-hidden>🛒</span> Количка
          </Link>
        </nav>

        {/* Mobile nav */}
        <MobileNav />
      </div>
    </header>
  );
}
