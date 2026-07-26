import type { Metadata } from "next";
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
    </div>
  );
}
