import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { RestaurantSettingsForm } from "@/components/admin/RestaurantSettingsForm";
import { getRestaurantSettings } from "@/lib/restaurant-settings";
import { getPaymentStatusSummary } from "@/lib/payments/admin";
import { CardDemoModeForm } from "@/components/admin/CardDemoModeForm";

export const metadata: Metadata = { title: "Настройки" };

/**
 * Restaurant settings — contact details and opening hours, editable by
 * ADMIN and SUPER_ADMIN (middleware guards the route; the save action
 * re-checks the role against the database).
 *
 * The values live in the database (one canonical row) and are what the public
 * site publishes. Session-dependent, so it must never be prerendered.
 *
 * The admin panel stays Bulgarian-only on purpose (docs/project-scope.md).
 */
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getRestaurantSettings();
  const payments = await getPaymentStatusSummary();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Настройки
      </h1>
      <p className="mt-1.5 text-sm text-pizza-muted">
        Данни на ресторанта, както се показват на сайта.
      </p>

      <RestaurantSettingsForm settings={settings} />

      <section className="mt-6 rounded-2xl border border-pizza-cream-dark bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-pizza-ink">
          Настройки на печата
        </h2>
        <p className="mt-1 text-sm text-pizza-muted">
          Какво излиза на бележките за кухня и доставка, с какъв размер и на коя
          позиция — отделно за печат през браузъра и за термо принтера.
        </p>
        <Link
          href="/admin/settings/print"
          className="mt-3 inline-block rounded-xl bg-pizza-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-700"
        >
          🖨 Отвори настройките на печата
        </Link>
      </section>

      {/* The REAL provider is configured through environment variables on the
          server (docs/online-card-payments.md) and shown read-only here. The
          one switch on this page is the card DEMO (simulator, no real money),
          which the owner turns on to test the flow on the live site. */}
      <section className="mt-6 rounded-2xl border border-pizza-cream-dark bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-pizza-ink">
          Онлайн плащане с карта
        </h2>
        <p
          className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold ${
            payments.enabled ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-700"
          }`}
        >
          {payments.enabled
            ? "Истински доставчик: включен"
            : "Истинска банка: не е настроена (виж демото по-долу)"}
        </p>
        <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-pizza-muted">Среда на сайта (APP_ENV)</dt>
          <dd className="font-mono">{payments.appEnv}</dd>
          <dt className="text-pizza-muted">Доставчик</dt>
          <dd className="font-mono">
            {payments.provider ?? "—"}
            {payments.environment ? ` / ${payments.environment}` : ""}
          </dd>
          <dt className="text-pizza-muted">Валута</dt>
          <dd className="font-mono">{payments.currency}</dd>
          <dt className="text-pizza-muted">Публичен адрес</dt>
          <dd className="break-all font-mono">{payments.baseUrl || "—"}</dd>
          <dt className="text-pizza-muted">Return URL за банката</dt>
          <dd className="break-all font-mono">{payments.returnUrl ?? "—"}</dd>
          <dt className="text-pizza-muted">Callback URL за банката</dt>
          <dd className="break-all font-mono">{payments.callbackUrl ?? "—"}</dd>
        </dl>
        {payments.problems.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-700">
            {payments.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {payments.environment && payments.environment !== "production" && (
          <p className="mt-3 text-sm font-semibold text-fuchsia-800">
            Тестов режим: поръчките, платени така, са тестови и не са реални пари.
          </p>
        )}

        <div className="mt-5 border-t border-pizza-cream-dark pt-4">
          <CardDemoModeForm
            mode={payments.demoMode}
            publicAllowed={payments.appEnv !== "production"}
          />
          {payments.demoMode !== "OFF" && payments.demoProblems.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
              {payments.demoProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-pizza-muted">
            Тестови карти: 4242 4242 4242 4242 (успех), 4000 0000 0000 9995 (отказ). Демо
            поръчките са маркирани „ТЕСТ — НЕ ПРИГОТВЯЙ“, не са реални пари и не пращат имейли.
            Щом има настроена истинска банка, тя е с предимство пред демото.
          </p>
        </div>
      </section>
    </div>
  );
}
