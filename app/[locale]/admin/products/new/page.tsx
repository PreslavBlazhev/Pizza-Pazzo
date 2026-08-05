import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { getAdminCategories } from "@/lib/admin-menu";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "Нов продукт" };

/**
 * New product — ADMIN+, the same form as the editor with nothing filled in.
 *
 * This static segment sits next to `[id]`, and Next matches static before
 * dynamic, so /admin/products/new never reaches the editor. The middleware
 * already guards every /admin/products/ subpath for ADMIN+.
 */
export default async function AdminProductCreatePage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const categories = await getAdminCategories();

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/products"
        className="text-sm font-medium text-pizza-muted transition hover:text-brand"
      >
        ← Всички продукти
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Нов продукт
      </h1>
      <p className="mb-8 mt-1.5 text-sm text-pizza-muted">
        Продуктът се появява в менюто веднага след „Създай“ — махнете отметката
        „Наличен“, ако още не искате да се вижда.
      </p>
      <ProductForm categories={categories} />
    </div>
  );
}
