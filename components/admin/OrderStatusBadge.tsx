import type { OrderStatus } from "@/types/order";
import { Badge } from "@/components/ui/Badge";

const map: Record<OrderStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  pending: { label: "Чакаща", tone: "warning" },
  accepted: { label: "Приета", tone: "info" },
  preparing: { label: "Приготвя се", tone: "info" },
  out_for_delivery: { label: "За доставка", tone: "info" },
  completed: { label: "Изпълнена", tone: "success" },
  cancelled: { label: "Отказана", tone: "danger" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}
