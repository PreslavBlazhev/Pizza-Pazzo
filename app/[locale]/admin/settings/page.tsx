import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { RestaurantSettingsForm } from "@/components/admin/RestaurantSettingsForm";
import { getRestaurantSettings } from "@/lib/restaurant-settings";
import { getPaymentStatusSummary, type PaymentStatusSummary } from "@/lib/payments/admin";
import { CardDemoModeForm } from "@/components/admin/CardDemoModeForm";
import { CardAudienceForm } from "@/components/admin/CardAudienceForm";

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
  /** The production terminal is configured and valid (real money). */
  const realBank = payments.enabled && payments.environment === "production";

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

      {/* Card payments. The REAL bank (ОББ's UPC terminal) is configured on the
          server (terminal, keys, currency — docs/UBB-UPC-PRODUCTION.md); WHO is
          offered it is the switch below, stored in the database and stronger
          than the server's PAYMENT_PRODUCTION_AUDIENCE. The DEMO simulator is a
          separate, staff-only tool and is kept apart from it. */}
      <section className="mt-6 rounded-2xl border border-pizza-cream-dark bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-pizza-ink">
          {realBank ? "Реални плащания чрез ОББ" : "Онлайн плащане с карта"}
        </h2>
        <p
          className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold ${
            payments.publicLive
              ? "bg-green-100 text-green-800"
              : realBank
                ? "bg-amber-100 text-amber-900"
                : "bg-neutral-100 text-neutral-700"
          }`}
        >
          {payments.publicLive
            ? "Активно: всички клиенти могат да платят с карта"
            : realBank
              ? "Активно само за влезлия персонал (клиентите не виждат картата)"
              : payments.enabled
                ? "Тестова банкова среда — не са реални пари"
                : "Реалната банка не е настроена на сървъра"}
        </p>

        {payments.environment === "production" && (
          <CardAudienceForm publicCard={payments.audience === "everyone"} bankReady={realBank} />
        )}

        <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-pizza-muted">Кой вижда картата</dt>
          <dd>
            {!payments.enabled
              ? "никой"
              : payments.audience === "staff"
                ? "само влезлия персонал"
                : "всички клиенти (гости и регистрирани)"}
            {payments.environment === "production" && (
              <span className="text-pizza-muted">
                {" — "}
                {payments.audienceSource === "admin"
                  ? "от настройката тук"
                  : `от сървъра (PAYMENT_PRODUCTION_AUDIENCE=${payments.envAudience ?? "—"})`}
                {payments.audienceSource === "admin" && payments.envAudience
                  ? `; стойността на сървъра (${payments.envAudience}) вече не се ползва`
                  : ""}
              </span>
            )}
          </dd>
          <dt className="text-pizza-muted">Доставчик / среда</dt>
          <dd className="font-mono">
            {payments.provider ?? "—"}
            {payments.environment ? ` / ${payments.environment}` : ""}
            <span className="font-sans text-pizza-muted"> (APP_ENV={payments.appEnv})</span>
          </dd>
          <dt className="text-pizza-muted">Незавършени опити (ОББ)</dt>
          <dd className="font-mono">
            {Object.keys(payments.openUpcAttempts).length === 0
              ? "няма"
              : Object.entries(payments.openUpcAttempts)
                  .map(([environment, count]) => `${environment}: ${count}`)
                  .join(", ")}
          </dd>
          <dt className="text-pizza-muted">Валута</dt>
          <dd className="font-mono">{payments.currency}</dd>
          <dt className="text-pizza-muted">Публичен адрес</dt>
          <dd className="break-all font-mono">{payments.baseUrl || "—"}</dd>
          {payments.upcPortalUrls ? (
            <>
              {/* Exactly what goes into ОББ's portal: Terminals → MerchantID → TerminalID. */}
              <dt className="text-pizza-muted">SUCCESS_URL (портал на ОББ)</dt>
              <dd className="break-all font-mono">{payments.upcPortalUrls.success}</dd>
              <dt className="text-pizza-muted">FAILURE_URL (портал на ОББ)</dt>
              <dd className="break-all font-mono">{payments.upcPortalUrls.failure}</dd>
              <dt className="text-pizza-muted">NOTIFY_URL (портал на ОББ)</dt>
              <dd className="break-all font-mono">{payments.upcPortalUrls.notify}</dd>
            </>
          ) : (
            <>
              <dt className="text-pizza-muted">Return URL за банката</dt>
              <dd className="break-all font-mono">{payments.returnUrl ?? "—"}</dd>
              <dt className="text-pizza-muted">Callback URL за банката</dt>
              <dd className="break-all font-mono">{payments.callbackUrl ?? "—"}</dd>
            </>
          )}
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
        {/* The demo simulator: staff-only on the live site (production reads a
            stored EVERYONE as STAFF), never instead of a configured bank. */}
        {realBank ? (
          <details className="mt-5 border-t border-pizza-cream-dark pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-pizza-muted">
              Демо симулатор (без реални пари) — не се ползва, докато реалната банка е активна
            </summary>
            <DemoControls payments={payments} showTestCards={false} />
          </details>
        ) : (
          <div className="mt-5 border-t border-pizza-cream-dark pt-4">
            <DemoControls payments={payments} showTestCards />
          </div>
        )}
      </section>
    </div>
  );
}

function DemoControls({
  payments,
  showTestCards,
}: {
  payments: PaymentStatusSummary;
  showTestCards: boolean;
}) {
  return (
    <>
      <CardDemoModeForm mode={payments.demoMode} publicAllowed={payments.appEnv !== "production"} />
      {payments.demoMode !== "OFF" && payments.demoProblems.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
          {payments.demoProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {showTestCards ? (
        <p className="mt-2 text-xs text-pizza-muted">
          Тестови карти: 4242 4242 4242 4242 (успех), 4000 0000 0000 9995 (отказ). Демо
          поръчките са маркирани „ТЕСТ — НЕ ПРИГОТВЯЙ“, не са реални пари и не пращат имейли.
          Щом има настроена истинска банка, тя е с предимство пред демото.
        </p>
      ) : (
        <p className="mt-2 text-xs text-pizza-muted">
          Реалната банка е с предимство: докато е активна, демото не се показва в checkout.
        </p>
      )}
    </>
  );
}
