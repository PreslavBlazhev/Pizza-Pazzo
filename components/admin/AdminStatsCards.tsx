import type { AdminDashboardStats } from "@/types/admin";
import { formatEurPrice } from "@/lib/format-price";
import { Card } from "@/components/ui/Card";

/** Dashboard KPI cards, fed with real figures from `getAdminDashboardStats`. */
export function AdminStatsCards({ stats }: { stats: AdminDashboardStats }) {
  const items: { label: string; value: string; sub?: string }[] = [
    { label: "Поръчки днес", value: String(stats.ordersToday) },
    { label: "Оборот днес", value: formatEurPrice(stats.revenueTodayEur) },
    { label: "Чакащи", value: String(stats.pendingOrders) },
    { label: "Активни", value: String(stats.activeOrders) },
    { label: "Доставени (общо)", value: String(stats.deliveredOrders) },
    { label: "Отказани (общо)", value: String(stats.cancelledOrders) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((i) => (
        <Card key={i.label}>
          <p className="text-xs uppercase tracking-wide text-neutral-500">{i.label}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-800">{i.value}</p>
          {i.sub && <p className="text-xs text-neutral-400">{i.sub}</p>}
        </Card>
      ))}
    </div>
  );
}
