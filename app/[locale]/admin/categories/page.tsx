import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getAdminCategories } from "@/lib/admin-menu";
import { CategoryEditForm } from "@/components/admin/CategoryEditForm";

export const metadata: Metadata = { title: "Категории" };

/**
 * Category management (ADMIN+ — categories shape the whole public menu, so
 * this is not a STAFF page). Deactivating a category hides it AND its
 * products from the site; the products stay in the database untouched.
 */
export default async function AdminCategoriesPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const categories = await getAdminCategories();

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-pizza-ink sm:text-3xl">
        Категории
      </h1>
      <p className="mb-6 mt-1.5 text-sm text-pizza-muted">
        Редът определя подредбата в менюто. Неактивна категория скрива и
        продуктите си от сайта. Промените се публикуват веднага.
      </p>

      <div className="space-y-4">
        {categories.map((c) => (
          <CategoryEditForm key={c.id} category={c} />
        ))}
      </div>
    </div>
  );
}
