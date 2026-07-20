import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { NAV_LINKS } from "./Header";
import { SITE, WORKING_HOURS } from "@/lib/constants";

const LEGAL_LINKS = [
  { href: "/terms", labelKey: "terms" },
  { href: "/privacy", labelKey: "privacy" },
  { href: "/cookies", labelKey: "cookies" },
  { href: "/delivery", labelKey: "delivery" },
  { href: "/refunds", labelKey: "refunds" },
] as const;

export function Footer() {
  const t = useTranslations();
  const tHours = useTranslations("hours");
  const tLegal = useTranslations("legal");

  return (
    <footer className="border-t border-pizza-cream-dark bg-white">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo className="h-16" linked={false} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-pizza-muted">
            {t("footer.about", { year: SITE.foundedYear })}
          </p>
        </div>

        {/* Nav */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-pizza-ink">
            {t("footer.navigation")}
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-pizza-muted">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition hover:text-brand">
                  {t(`nav.${l.labelKey}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-pizza-ink">
            {t("footer.contacts")}
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
            {tHours("title")}
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-pizza-muted">
            {WORKING_HOURS.map((row) => (
              <li key={row.dayKey} className="flex flex-col">
                <span>{tHours(row.dayKey)}</span>
                <span
                  className={
                    row.closed
                      ? "font-medium text-brand"
                      : "font-medium text-pizza-ink"
                  }
                >
                  {row.closed ? tHours("closed") : row.hours}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-pizza-cream-dark">
        <div className="container flex flex-col items-center gap-3 py-5 text-xs text-pizza-muted">
          <nav aria-label={t("footer.legal")}>
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition hover:text-brand">
                    {tLegal(l.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex w-full flex-col items-center justify-between gap-2 sm:flex-row">
            <p>
              {t("footer.rights", {
                year: new Date().getFullYear(),
                legalName: SITE.legalName,
              })}
            </p>
            <p>{t("footer.madeWith")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
