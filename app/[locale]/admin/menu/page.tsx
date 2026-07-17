import type { Metadata } from "next";
import { use } from "react";
import { getCategoryById, getProducts } from "@/lib/menu-data";
import { formatBgnPrice } from "@/lib/format-price";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Locale } from "@/i18n/routing";

export const metadata: Metadata = { title: "Управление на менюто" };

/**
 * Admin menu management — UI PLACEHOLDER only (Stage 1).
 * The buttons do not perform any real action yet. Real add/edit/hide and image
 * upload arrive with the admin panel + storage (see docs/admin-panel-plan.md).
 */
export default function AdminMenuPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = use(params);
  const products = getProducts(locale).slice(0, 3);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Управление на менюто</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Тук админът ще може да добавя, редактира и скрива продукти.
          </p>
          <p className="text-sm text-neutral-500">
            Всеки продукт ще може да има снимка, цена, описание, категория и алергени.
          </p>
        </div>
        <Button type="button" title="Демо — все още не е активно">
          + Добави продукт
        </Button>
      </div>

      <div className="space-y-3">
        {products.map((p) => {
          const category = getCategoryById(p.categoryId, locale);
          return (
            <Card key={p.id} className="flex flex-wrap items-center gap-4">
              {/* Image slot placeholder */}
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-pizza-cream text-center text-[10px] font-medium text-pizza-green">
                Снимка
              </div>

              <div className="min-w-[160px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">{p.name}</span>
                  {!p.isAvailable && <Badge tone="danger">Скрит</Badge>}
                  {p.isPopular && <Badge tone="success">Популярно</Badge>}
                </div>
                <p className="text-xs text-neutral-500">
                  {category?.name} · {formatBgnPrice(p.priceBgn)}
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" title="Демо — все още не е активно">
                  Качи снимка
                </Button>
                <Button type="button" variant="ghost" title="Демо — все още не е активно">
                  Редактирай
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-pizza-muted">
        Забележка: бутоните за качване и редакция ще се активират, когато менюто
        се премести от статичните файлове в базата.
      </p>
    </div>
  );
}
