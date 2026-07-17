import type { Metadata } from "next";
import { FormAlert } from "@/components/ui/FormAlert";
import { SITE, WORKING_HOURS } from "@/lib/constants";

export const metadata: Metadata = { title: "Настройки" };

/**
 * Restaurant settings. Read-only for now: the values live in
 * `lib/constants.ts`, so editing them here means moving them into the database
 * first. Shown rather than hidden so staff can verify what the site publishes.
 */
export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Настройки
      </h1>
      <p className="mt-1.5 text-sm text-pizza-muted">
        Данни на ресторанта, както се показват на сайта.
      </p>

      <FormAlert tone="info" className="mt-6">
        Данните се четат от <code>lib/constants.ts</code> и засега се променят
        само от разработчик. Редакцията оттук ще се активира, когато настройките
        се преместят в базата.
      </FormAlert>

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
              <div key={row.days} className="flex justify-between gap-4">
                <dt className="text-pizza-muted">{row.days}</dt>
                <dd
                  className={
                    row.hours === "Затворено"
                      ? "font-medium text-brand"
                      : "font-medium text-pizza-ink"
                  }
                >
                  {row.hours}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <p className="mt-6 text-sm text-pizza-muted">
        Зони и цени за доставка, данни за печат и имейл известия ще се добавят
        заедно с модула за поръчки.
      </p>
    </div>
  );
}
