import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { SITE, WORKING_HOURS } from "@/lib/constants";

export const metadata: Metadata = { title: "Настройки" };

/**
 * Restaurant settings — the contact details and opening hours exactly as the
 * public site publishes them, so staff can verify them at a glance.
 *
 * Read-only: the values live in `lib/constants.ts`. Editing them from here
 * needs a settings table first (a separate phase), which is why there are no
 * edit controls rather than disabled ones.
 *
 * The admin panel stays Bulgarian-only on purpose (see docs/project-scope.md):
 * it is staff-facing. Only the day names are translated, because they are
 * shared with the public site.
 */
export default function AdminSettingsPage() {
  const tHours = useTranslations("hours");

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Настройки
      </h1>
      <p className="mt-1.5 text-sm text-pizza-muted">
        Данни на ресторанта, както се показват на сайта.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-pizza-cream-dark bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-pizza-ink">
            Контакти
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-pizza-muted">Адрес</dt>
              <dd className="mt-0.5 text-pizza-ink">{SITE.address}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-pizza-muted">
                Телефони
              </dt>
              <dd className="mt-0.5 text-pizza-ink">{SITE.phones.join(" · ")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-pizza-muted">Имейл</dt>
              <dd className="mt-0.5 break-all text-pizza-ink">{SITE.email}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-pizza-cream-dark bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-pizza-ink">
            Работно време
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            {WORKING_HOURS.map((row) => (
              <div key={row.dayKey} className="flex justify-between gap-4">
                <dt className="text-pizza-muted">{tHours(row.dayKey)}</dt>
                <dd
                  className={
                    row.closed
                      ? "font-medium text-brand"
                      : "font-medium text-pizza-ink"
                  }
                >
                  {row.closed ? tHours("closed") : row.hours}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
