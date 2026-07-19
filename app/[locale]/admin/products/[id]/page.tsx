import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { getAdminCategories, getAdminProduct } from "@/lib/admin-menu";
import { ProductEditForm } from "@/components/admin/ProductEditForm";

export const metadata: Metadata = { title: "Редакция на продукт" };

/** Product editor — ADMIN+ (STAFF has only the availability toggle). */
export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const { id } = await params;
  const [product, categories] = await Promise.all([
    getAdminProduct(id),
    getAdminCategories(),
  ]);
  if (!product) notFound();

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/products"
        className="text-sm font-medium text-pizza-muted transition hover:text-brand"
      >
        ← Всички продукти
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        {product.nameBg}
      </h1>
      <p className="mb-8 mt-1.5 text-sm text-pizza-muted">
        Промените се публикуват на сайта веднага след „Запази“.
      </p>
      <ProductEditForm product={product} categories={categories} />
    </div>
  );
}
