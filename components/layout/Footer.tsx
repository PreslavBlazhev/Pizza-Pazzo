import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { NAV_LINKS } from "./Header";
import { SITE } from "@/lib/constants";
import {
  getRestaurantSettings,
  settingsAddress,
  settingsPhones,
} from "@/lib/restaurant-settings";
import { groupWorkingHours, telHref, workingHoursRowLabel } from "@/lib/working-hours";
import type { Weekday } from "@/types/settings";

const LEGAL_LINKS = [
  { href: "/terms", labelKey: "terms" },
  { href: "/privacy", labelKey: "privacy" },
  { href: "/cookies", labelKey: "cookies" },
  { href: "/delivery", labelKey: "delivery" },
  { href: "/refunds", labelKey: "refunds" },
] as const;

/**
 * Site footer. Async because the contact details and opening hours come from
 * the database (admin-editable); the read is cached and tag-invalidated, so
 * this costs one query per cache miss, not one per page.
 */
export async function Footer() {
  const t = await getTranslations();
  const tHours = await getTranslations("hours");
  const tLegal = await getTranslations("legal");
  const locale = await getLocale();

  const settings = await getRestaurantSettings();
  const address = settingsAddress(settings, locale);
  const phones = settingsPhones(settings);
  const hourRows = groupWorkingHours(settings.hours);
  const dayName = (day: Weekday) => tHours(day);

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
              <span aria-hidden>📍</span> {address}
            </li>
            {phones.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <span aria-hidden>📞</span>
                <a href={telHref(p)} className="transition hover:text-brand">
                  {p}
                </a>
              </li>
            ))}
            <li className="flex items-start gap-2">
              <span aria-hidden>✉️</span>
              <a
                href={`mailto:${settings.contactEmail}`}
                className="transition hover:text-brand"
              >
                {settings.contactEmail}
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
            {hourRows.map((row) => (
              <li key={row.days[0]} className="flex flex-col">
                <span>{workingHoursRowLabel(row, dayName)}</span>
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
