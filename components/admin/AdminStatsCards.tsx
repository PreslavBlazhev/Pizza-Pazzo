import type { AdminStats } from "@/types/admin";
import { formatEur } from "@/lib/format-price";
import { Card } from "@/components/ui/Card";

/** Dashboard KPI cards (placeholder data passed in; real stats in Stage 5+). */
export function AdminStatsCards({ stats }: { stats: AdminStats }) {
  const items = [
    { label: "Поръчки днес", value: String(stats.ordersToday) },
    { label: "Чакащи", value: String(stats.pendingOrders) },
    { label: "Оборот днес", value: formatEur(stats.revenueToday) },
    { label: "Ср. време", value: `${stats.avgPrepMinutes} мин` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((i) => (
        <Card key={i.label}>
          <p className="text-xs uppercase tracking-wide text-neutral-500">{i.label}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-800">{i.value}</p>
        </Card>
      ))}
    </div>
  );
}
