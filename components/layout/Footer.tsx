import Link from "next/link";
import { Logo } from "./Logo";
import { SITE, WORKING_HOURS } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-pizza-cream-dark bg-white">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo className="h-16" linked={false} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-pizza-muted">
            Автентична италианска пица с доставка до вашата врата. С грижа към
            вкуса от {SITE.foundedYear} г.
          </p>
        </div>

        {/* Nav */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-pizza-ink">
            Навигация
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-pizza-muted">
            <li><Link href="/" className="transition hover:text-brand">Начало</Link></li>
            <li><Link href="/menu" className="transition hover:text-brand">Меню</Link></li>
            <li><Link href="/gallery" className="transition hover:text-brand">Галерия</Link></li>
            <li><Link href="/reviews" className="transition hover:text-brand">Отзиви</Link></li>
            <li><Link href="/contacts" className="transition hover:text-brand">Контакти</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-pizza-ink">
            Контакти
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-pizza-muted">
            <li className="flex items-start gap-2">
              <span aria-hidden>📍</span> {SITE.address}
            </li>
            {SITE.phones.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <span aria-hidden>📞</span>
                <a
                  href={`tel:${p.replace(/\s/g, "")}`}
                  className="transition hover:text-brand"
                >
                  {p}
                </a>
              </li>
            ))}
            <li className="flex items-start gap-2">
              <span aria-hidden>✉️</span>
              <a href={`mailto:${SITE.email}`} className="transition hover:text-brand">
                {SITE.email}
              </a>
            </li>
          </ul>
        </div>

        {/* Hours */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-pizza-ink">
            Работно време
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-pizza-muted">
            {WORKING_HOURS.map((row) => (
              <li key={row.days} className="flex flex-col">
                <span>{row.days}</span>
                <span
                  className={
                    row.hours === "Затворено"
                      ? "font-medium text-brand"
                      : "font-medium text-pizza-ink"
                  }
                >
                  {row.hours}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-pizza-cream-dark">
        <div className="container flex flex-col items-center justify-between gap-2 py-5 text-xs text-pizza-muted sm:flex-row">
          <p>
            © {new Date().getFullYear()} {SITE.legalName}. Всички права запазени.
          </p>
          <p>Приготвено с ❤️ и много моцарела.</p>
        </div>
      </div>
    </footer>
  );
}
