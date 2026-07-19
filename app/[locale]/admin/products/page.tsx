import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getAdminCategories, getAdminProducts } from "@/lib/admin-menu";
import { getCurrentRole } from "@/lib/auth";
import { formatDualPrice } from "@/lib/format-price";
import { Badge } from "@/components/ui/Badge";
import { ProductAvailabilityToggle } from "@/components/admin/ProductAvailabilityToggle";

export const metadata: Metadata = { title: "Продукти" };

/**
 * The real menu management list (DB-backed since 2026-07-18).
 *
 * STAFF can flip availability (the everyday "sold out" case); editing
 * everything else is ADMIN+, so the edit link is hidden below STAFF — the
 * actions and the edit page re-check the role regardless.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category = "" } = await searchParams;
  const [products, categories, role] = await Promise.all([
    getAdminProducts(),
    getAdminCategories(),
    getCurrentRole(),
  ]);
  const canEdit = role === "ADMIN" || role === "SUPER_ADMIN";
  const categoryName = new Map(categories.map((c) => [c.id, c.nameBg]));

  const needle = q.trim().toLowerCase();
  const filtered = products.filter(
    (p) =>
      (!category || p.categoryId === category) &&
      (!needle ||
        p.nameBg.toLowerCase().includes(needle) ||
        p.nameEn.toLowerCase().includes(needle) ||
        p.slug.includes(needle))
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
            Продукти
          </h1>
          <p className="mt-1.5 text-sm text-pizza-muted">
            {products.length} продукта в {categories.length} категории.
            Промените се виждат на сайта веднага.
          </p>
        </div>
      </div>

      {/* Filter — plain GET form, so the URL is shareable and back works. */}
      <form className="mb-5 flex flex-wrap gap-2" action="" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Търси по име…"
          className="w-56 rounded-xl border border-pizza-cream-dark bg-white px-3.5 py-2 text-sm text-pizza-ink outline-none transition focus:border-pizza-green focus:ring-2 focus:ring-pizza-green/25"
        />
        <select
          name="category"
          defaultValue={category}
          className="rounded-xl border border-pizza-cream-dark bg-white px-3 py-2 text-sm text-pizza-ink outline-none transition focus:border-pizza-green focus:ring-2 focus:ring-pizza-green/25"
        >
          <option value="">Всички категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameBg} ({c.productCount})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-pizza-green px-4 py-2 text-sm font-semibold text-white transition hover:bg-pizza-green-dark"
        >
          Филтрирай
        </button>
        {(q || category) && (
          <Link
            href="/admin/products"
            className="self-center px-2 text-sm font-medium text-pizza-muted transition hover:text-pizza-ink"
          >
            Изчисти
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-pizza-cream-dark bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-pizza-cream/60 text-left text-pizza-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Продукт</th>
              <th className="px-4 py-2.5 font-medium">Категория</th>
              <th className="px-4 py-2.5 font-medium">Цена</th>
              <th className="px-4 py-2.5 font-medium">Статус</th>
              <th className="px-4 py-2.5 font-medium">Наличност</th>
              {canEdit && <th className="px-4 py-2.5 font-medium">Действия</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-pizza-cream-dark/60">
                <td className="px-4 py-2.5">
                  <span className="font-semibold text-pizza-ink">{p.nameBg}</span>
                  {p.nameEn && (
                    <span className="ml-2 text-xs text-pizza-muted">{p.nameEn}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-pizza-muted">
                  {categoryName.get(p.categoryId) ?? p.categoryId}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  {formatDualPrice(p.priceEur, p.priceBgn)}
                  {p.variants.length > 0 && (
                    <span className="ml-1.5 text-xs text-pizza-muted">
                      · {p.variants.length} варианта
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    {!p.isAvailable && <Badge tone="danger">Скрит</Badge>}
                    {p.isPopular && <Badge tone="success">Популярно</Badge>}
                    {p.allergensUnverified && <Badge tone="warning">Алергени?</Badge>}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <ProductAvailabilityToggle
                    productId={p.id}
                    isAvailable={p.isAvailable}
                  />
                </td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-semibold text-pizza-green transition hover:text-pizza-green-dark"
                    >
                      Редактирай
                    </Link>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 6 : 5}
                  className="px-4 py-10 text-center text-pizza-muted"
                >
                  Няма продукти по този филтър.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
