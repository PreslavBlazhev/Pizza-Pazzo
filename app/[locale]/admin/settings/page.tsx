import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { RestaurantSettingsForm } from "@/components/admin/RestaurantSettingsForm";
import { getRestaurantSettings } from "@/lib/restaurant-settings";

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
    </div>
  );
}
