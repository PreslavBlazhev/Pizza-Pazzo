import type { Metadata } from "next";
import Link from "next/link";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { FormAlert } from "@/components/ui/FormAlert";
import { getSessionUser } from "@/lib/auth";
import { isAdminRole } from "@/types/auth";
import type { AdminStats } from "@/types/admin";

export const metadata: Metadata = {
  title: "Табло",
  robots: { index: false, follow: false },
};

/**
 * Demo figures. Orders do not exist yet, so there is nothing real to count —
 * the banner below says so out loud, because an unlabelled number on a
 * dashboard will be read as fact.
 */
const demoStats: AdminStats = {
  ordersToday: 0,
  pendingOrders: 0,
  revenueToday: 0,
  avgPrepMinutes: 0,
};

export default async function AdminDashboardPage() {
  const sessionUser = await getSessionUser();
  const firstName = sessionUser?.profile?.fullName?.split(" ")[0];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Табло
      </h1>
      <p className="mt-1.5 text-sm text-pizza-muted">
        Добре дошли{firstName ? `, ${firstName}` : ""}.
      </p>

      <FormAlert tone="info" className="mt-6">
        Показателите са нулеви, защото модулът за поръчки още не е разработен.
        Тук ще се показват реални данни, когато поръчките заработят.
      </FormAlert>

      <div className="mt-6">
        <AdminStatsCards stats={demoStats} />
      </div>

      {isAdminRole(sessionUser?.role ?? null) && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/users"
            className="rounded-2xl border border-pizza-cream-dark bg-white p-5 transition hover:border-pizza-green/40 hover:shadow-card"
          >
            <p className="font-display text-lg font-semibold text-pizza-ink">
              Потребители
            </p>
            <p className="mt-1 text-sm text-pizza-muted">
              Профили, роли и служебни акаунти.
            </p>
          </Link>
          <Link
            href="/admin/menu"
            className="rounded-2xl border border-pizza-cream-dark bg-white p-5 transition hover:border-pizza-green/40 hover:shadow-card"
          >
            <p className="font-display text-lg font-semibold text-pizza-ink">Меню</p>
            <p className="mt-1 text-sm text-pizza-muted">
              Продукти, категории и наличности.
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}
