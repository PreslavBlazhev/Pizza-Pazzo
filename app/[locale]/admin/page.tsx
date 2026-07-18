import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { OrderCard } from "@/components/admin/OrderCard";
import { getSessionUser } from "@/lib/auth";
import { getAdminDashboardStats, getLatestOrders } from "@/lib/orders";
import { isAdminRole } from "@/types/auth";

export const metadata: Metadata = {
  title: "Табло",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const [sessionUser, stats, latestOrders] = await Promise.all([
    getSessionUser(),
    getAdminDashboardStats(),
    getLatestOrders(5),
  ]);
  const firstName = sessionUser?.fullName?.split(" ")[0];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Табло
      </h1>
      <p className="mt-1.5 text-sm text-pizza-muted">
        Добре дошли{firstName ? `, ${firstName}` : ""}.
      </p>

      <div className="mt-6">
        <AdminStatsCards stats={stats} />
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-pizza-ink">
            Последни поръчки
          </h2>
          <Link
            href="/admin/orders"
            className="text-sm font-medium text-neutral-700 transition hover:text-brand"
          >
            Виж всички →
          </Link>
        </div>
        {latestOrders.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-pizza-cream-dark bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Все още няма поръчки.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {latestOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
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
